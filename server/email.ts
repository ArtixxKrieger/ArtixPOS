import nodemailer from "nodemailer";

// ─── Transport strategy ───────────────────────────────────────────────────────
// Vercel serverless functions cannot reliably hold the multi-round-trip TCP
// connection that SMTP requires. When a Resend API key is configured we use
// Resend's HTTP API instead — a single HTTPS POST using Node's built-in fetch.
// No extra npm package required, so no lockfile/registry issues on Vercel.
//
// Detection order:
//   1. RESEND_API_KEY env var (explicit)
//   2. SMTP_PASS that starts with "re_" (user already put their Resend key there)
//   3. Fall back to nodemailer SMTP for any other provider

function getResendApiKey(): string | null {
  // Explicit dedicated variable — most reliable, no prefix-sniffing required
  const explicit = process.env.RESEND_API_KEY?.trim();
  if (explicit) return explicit;
  // Fallback: detect Resend API key stored in SMTP_PASS (trim to tolerate spaces/quotes)
  const smtpPass = process.env.SMTP_PASS?.trim().replace(/^["']|["']$/g, "");
  if (smtpPass?.startsWith("re_")) return smtpPass;
  return null;
}

/** Called once at startup — logs which email transport is active without revealing the key. */
export function logEmailTransportStatus(): void {
  const key = getResendApiKey();
  if (key) {
    const masked = key.slice(0, 7) + "..." + key.slice(-4);
    console.log(`[email] transport=resend-http-api key=${masked}`);
    return;
  }
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (host && user && pass) {
    console.log(`[email] transport=smtp host=${host} user=${user}`);
  } else {
    console.warn("[email] ⚠  NO EMAIL TRANSPORT CONFIGURED — password reset emails will not send.");
    console.warn("[email]    Set RESEND_API_KEY=re_xxx in your environment to enable email.");
  }
}

// SMTP fallback — only used when not using Resend HTTP API
let _transporter: nodemailer.Transporter | null | undefined = undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;
  // Don't create an SMTP transporter when we'll use Resend's HTTP API instead
  if (getResendApiKey()) { _transporter = null; return null; }
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) { _transporter = null; return null; }
  _transporter = nodemailer.createTransport({
    host, port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
  });
  return _transporter;
}

export function resetTransporter(): void {
  _transporter = undefined;
}

// ─── Concurrency limiter ───────────────────────────────────────────────────────
// Caps simultaneous outbound email calls so a burst of registrations/resets
// cannot overwhelm the provider or trigger rate-limit bans.
const MAX_CONCURRENT_SENDS = 5;
let _activeCount = 0;
const _waitQueue: Array<() => void> = [];

function _acquireSlot(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (_activeCount < MAX_CONCURRENT_SENDS) {
      _activeCount++;
      resolve();
    } else {
      _waitQueue.push(() => { _activeCount++; resolve(); });
    }
  });
}

function _releaseSlot(): void {
  _activeCount--;
  const next = _waitQueue.shift();
  if (next) next();
}

// ─── Per-attempt result type ──────────────────────────────────────────────────
type AttemptResult =
  | { ok: true }
  | { ok: false; permanent: true }
  | { ok: false; permanent: false; retryAfterMs?: number };

// ─── Single Resend HTTP attempt ───────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 10_000; // 10 s — abort if provider hangs

async function _attemptResend(
  key: string,
  from: string,
  opts: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> },
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text: opts.text, html: opts.html, headers: opts.headers }),
    });
    const body = await res.text().catch(() => "(unreadable)");

    if (res.ok) return { ok: true };

    if (res.status === 429) {
      const ra = parseInt(res.headers.get("retry-after") ?? "2", 10);
      console.warn(`[email] Resend rate-limited (429), retry-after=${ra}s`);
      return { ok: false, permanent: false, retryAfterMs: ra * 1000 };
    }
    if (res.status >= 500) {
      console.warn(`[email] Resend server error ${res.status}:`, body.slice(0, 200));
      return { ok: false, permanent: false };
    }
    // 4xx (not 429) — bad request / invalid email — no point retrying
    console.error(`[email] Resend permanent error ${res.status}:`, body.slice(0, 200));
    return { ok: false, permanent: true };
  } catch (err: any) {
    const reason = err?.name === "AbortError" ? "timeout (10 s)" : (err?.message ?? String(err));
    console.warn(`[email] Resend network error: ${reason}`);
    return { ok: false, permanent: false };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Unified send helper ──────────────────────────────────────────────────────
// • Queues through the concurrency limiter (max 5 concurrent sends)
// • Up to 3 attempts with exponential back-off (1 s → 2 s → 4 s + jitter)
// • Respects Retry-After header on 429 responses
// • Returns true on success, false on permanent or exhausted failure (never throws)
const MAX_ATTEMPTS = 3;

async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}): Promise<boolean> {
  const from = (() => {
    const addr = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@artixpos.com";
    return addr.includes("<") ? addr : `ArtixPOS <${addr}>`;
  })();

  const resendKey = getResendApiKey();
  const transport = resendKey ? "resend-api" : "smtp";
  console.log(`[email] queued transport=${transport} to=${opts.to} subject="${opts.subject}" queue=${_waitQueue.length}`);

  await _acquireSlot();
  try {
    // ── Resend HTTP API path ────────────────────────────────────────────────
    if (resendKey) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          const jitter = Math.random() * 200;
          const baseDelay = 1000 * 2 ** (attempt - 2); // 1 s, 2 s, 4 s
          const delay = Math.min(baseDelay + jitter, 8000);
          console.warn(`[email] Resend retry ${attempt}/${MAX_ATTEMPTS} in ${Math.round(delay)}ms to=${opts.to}`);
          await new Promise<void>((r) => setTimeout(r, delay));
        }

        const result = await _attemptResend(resendKey, from, opts);

        if (result.ok) {
          if (attempt > 1) console.log(`[email] Resend succeeded on attempt ${attempt} to=${opts.to}`);
          else console.log(`[email] Resend sent to=${opts.to}`);
          return true;
        }
        if (result.permanent) return false; // e.g. invalid email address — no retry

        // Transient failure — if the provider asked us to wait longer, honour it
        if (result.retryAfterMs && result.retryAfterMs > 0 && attempt < MAX_ATTEMPTS) {
          console.warn(`[email] Honouring Retry-After ${result.retryAfterMs}ms before next attempt`);
          await new Promise<void>((r) => setTimeout(r, result.retryAfterMs));
        }
      }
      console.error(`[email] Resend gave up after ${MAX_ATTEMPTS} attempts to=${opts.to}`);
      return false;
    }

    // ── SMTP (nodemailer) path ──────────────────────────────────────────────
    const transporter = getTransporter();
    if (!transporter) {
      console.warn("[email] No transport configured — set RESEND_API_KEY or SMTP_HOST/USER/PASS");
      return false;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        const delay = Math.min(1000 * 2 ** (attempt - 2) + Math.random() * 200, 8000);
        console.warn(`[email] SMTP retry ${attempt}/${MAX_ATTEMPTS} in ${Math.round(delay)}ms to=${opts.to}`);
        await new Promise<void>((r) => setTimeout(r, delay));
      }
      try {
        await transporter.sendMail({ from, ...opts });
        if (attempt > 1) console.log(`[email] SMTP succeeded on attempt ${attempt} to=${opts.to}`);
        else console.log(`[email] SMTP sent to=${opts.to}`);
        return true;
      } catch (err: any) {
        // SMTP 5xx = transient; 4xx = permanent (bad address, auth, etc.)
        const code: number = err?.responseCode ?? 0;
        const isPermanent = code >= 400 && code < 500;
        console.error(`[email] SMTP attempt ${attempt} failed (code=${code}):`, err?.message);
        if (isPermanent) return false; // no retry
      }
    }
    console.error(`[email] SMTP gave up after ${MAX_ATTEMPTS} attempts to=${opts.to}`);
    return false;
  } finally {
    _releaseSlot();
  }
}

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Shared email shell ───────────────────────────────────────────────────────
// All emails wrap their content in this shell. It sets the outer background,
// max-width, and basic resets. bodyHtml slots in between the outer table rows.
function emailShell(bodyHtml: string, previewText = ""): string {
  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <meta name="x-apple-disable-message-reformatting">
  <title>ArtixPOS</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0;padding:0;background-color:#eff6ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;}
    .email-container{max-width:600px;margin:0 auto;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
    @media only screen and (max-width:600px){
      .email-container{width:100%!important;}
      .px-m{padding-left:20px!important;padding-right:20px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eff6ff;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(previewText)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#eff6ff;">
    <tr>
      <td align="center" style="padding:40px 16px 48px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="email-container" style="max-width:600px;">
          ${bodyHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/** VML-safe CTA button — renders as a real rectangle in Outlook, proper button everywhere else. */
function ctaButton(label: string, url: string, color = "#2563eb"): string {
  const safeHref = escHtml(url);
  return `
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
    href="${safeHref}" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="16%" stroke="f" fillcolor="${color}">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;">${label}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <a href="${safeHref}" style="display:inline-block;background-color:${color};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.2px;line-height:1;padding:15px 40px;text-decoration:none;border-radius:10px;mso-hide:all;">${label}</a>
  <!--<![endif]-->`;
}

function globalFooter(): string {
  return `
  <tr>
    <td align="center" style="padding:28px 0 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1d4ed8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.3px;">ArtixPOS</p>
      <p style="margin:0;font-size:12px;color:#60a5fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
        Your industry. Your POS. &mdash; <a href="https://artixpos.com" style="color:#2563eb;text-decoration:none;">artixpos.com</a>
      </p>
    </td>
  </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML generators (exported so dev preview route can call them directly)
// ─────────────────────────────────────────────────────────────────────────────

export function buildVerificationEmailHtml(verifyUrl: string): string {
  const safeUrl = escHtml(verifyUrl);
  const body = `
  <tr>
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(37,99,235,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Purple hero -->
        <tr>
          <td style="background-color:#2563eb;padding:36px 40px 32px;" class="px-m">
            <!-- Logo -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:rgba(255,255,255,0.18);border-radius:12px;width:42px;height:42px;text-align:center;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:42px;display:inline-block;width:42px;">A</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;opacity:0.95;">Artix<span style="opacity:0.65;">POS</span></span>
                </td>
              </tr>
            </table>
            <!-- Heading -->
            <p style="margin:0;font-size:32px;font-weight:800;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.15;letter-spacing:-0.6px;">Confirm your<br>email address</p>
            <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.75);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;">One quick step to activate your account</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 40px;" class="px-m">

            <!-- Status badge -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#f0fdf4;border:1.5px solid #86efac;border-radius:50px;padding:8px 18px 8px 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:16px;line-height:1;padding-right:8px;">&#9989;</td>
                      <td style="font-size:13px;font-weight:600;color:#15803d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Account created — just verify your email</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 32px;font-size:15px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.75;">
              Thanks for signing up for <strong style="color:#0f0a1e;">ArtixPOS</strong>! Click the button below to verify your email address. This link expires in <strong>24 hours</strong>.
            </p>

            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
              <tr><td>${ctaButton("Confirm email address", verifyUrl)}</td></tr>
            </table>

            <!-- Info box -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#f0f7ff;border-left:3px solid #2563eb;border-radius:0 10px 10px 0;padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#4b5563;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
                    &#128274;&nbsp; <strong style="color:#1f2937;">Security tip:</strong> If you didn't create an ArtixPOS account, you can safely ignore this email. No account will be created without confirmation.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:0;font-size:12px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;">
              Button not working? Copy and paste this URL into your browser:<br>
              <a href="${verifyUrl}" style="color:#2563eb;word-break:break-all;font-size:11px;">${safeUrl}</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${globalFooter()}`;

  return emailShell(body, "Verify your email to activate your ArtixPOS account.");
}

export function buildPasswordResetEmailHtml(resetUrl: string): string {
  const safeUrl = escHtml(resetUrl);
  const body = `
  <tr>
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(37,99,235,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Dark header -->
        <tr>
          <td style="background-color:#0f0a1e;padding:32px 40px 28px;" class="px-m">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td style="background-color:#2563eb;border-radius:12px;width:42px;height:42px;text-align:center;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:42px;display:inline-block;width:42px;">A</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;">Artix<span style="color:#2563eb;">POS</span></span>
                </td>
              </tr>
            </table>
            <!-- Alert badge -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
              <tr>
                <td style="background-color:#451a03;border:1px solid #92400e;border-radius:50px;padding:6px 16px 6px 10px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:14px;padding-right:8px;">&#9888;&#65039;</td>
                      <td style="font-size:12px;font-weight:600;color:#fbbf24;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Password reset requested &mdash; expires in 1 hour</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:30px;font-weight:800;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.2;letter-spacing:-0.5px;">Reset your<br>password</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 40px;" class="px-m">

            <p style="margin:0 0 32px;font-size:15px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.75;">
              We received a request to reset the password for your <strong style="color:#0f0a1e;">ArtixPOS</strong> account. Click the button below to choose a new password.
            </p>

            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
              <tr><td>${ctaButton("Reset my password", resetUrl)}</td></tr>
            </table>

            <!-- Steps -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#f9fafb;border-radius:12px;padding:20px 24px;">
                  <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.8px;">What happens next</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="padding:5px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:24px;height:24px;background-color:#2563eb;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:24px;">1</td>
                        <td style="padding-left:12px;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Click the button above within <strong>1 hour</strong></td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding:5px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:24px;height:24px;background-color:#2563eb;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:24px;">2</td>
                        <td style="padding-left:12px;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Enter and confirm your new password</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding:5px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:24px;height:24px;background-color:#2563eb;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:24px;">3</td>
                        <td style="padding-left:12px;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Sign back in to your account</td>
                      </tr></table>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:0 0 20px;font-size:12px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;">
              Button not working? Paste this URL into your browser:<br>
              <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;font-size:11px;">${safeUrl}</a>
            </p>

            <!-- Security note -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="border-top:1px solid #f3f4f6;padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;">
                    &#128274;&nbsp; Didn't request this? Ignore this email — your password won't change. Need help? <a href="mailto:support@artixpos.com" style="color:#2563eb;">support@artixpos.com</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${globalFooter()}`;

  return emailShell(body, "Reset your ArtixPOS password — this link expires in 1 hour.");
}

export interface ReceiptEmailData {
  total: string;
  subtotal: string;
  tax?: string | null;
  discount?: string | null;
  paymentMethod: string;
  customerName?: string | null;
  items: unknown;
  orNumber?: string | null;
  receiptNumber?: string | null;
  createdAt: string | Date;
}

export interface StoreInfo {
  name: string;
  currency?: string;
  address?: string | null;
  phone?: string | null;
  receiptFooter?: string | null;
}

export function buildReceiptEmailHtml(sale: ReceiptEmailData, store: StoreInfo): string {
  const currency    = store.currency ?? "₱";
  const fmt         = (v: string | null | undefined) => `${currency}${parseFloat(v ?? "0").toFixed(2)}`;
  const storeName   = escHtml(store.name);
  const storeAddr   = escHtml(store.address);
  const storePhone  = escHtml(store.phone);
  const storeFooter = escHtml(store.receiptFooter);
  const storeInit   = escHtml((store.name[0] ?? "S").toUpperCase());
  const refNum      = escHtml(sale.orNumber ?? sale.receiptNumber ?? "");
  const customer    = escHtml(sale.customerName ?? "");
  const pm          = escHtml(sale.paymentMethod);

  const dateStr = new Date(sale.createdAt).toLocaleString("en-PH", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const items = Array.isArray(sale.items) ? (sale.items as any[]) : [];
  const itemRows = items.map((item: any) => {
    const name  = escHtml(item?.product?.name ?? item?.name ?? item?.title ?? "Item");
    const size  = item?.size?.name ? ` <span style="color:#9ca3af;">(${escHtml(item.size.name)})</span>` : "";
    const qty   = item?.quantity ?? 1;
    const price = parseFloat(item?.size?.price ?? item?.product?.price ?? item?.price ?? "0");
    const mods  = (item?.modifiers ?? []).reduce((s: number, m: any) => s + parseFloat(m?.price ?? "0"), 0);
    const total = (price + mods) * qty;
    return `
    <tr>
      <td style="padding:11px 0;font-size:14px;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #f3f4f6;">
        <span style="font-weight:500;">${name}${size}</span>
        ${qty > 1 ? `<br><span style="font-size:12px;color:#9ca3af;">× ${qty}</span>` : ""}
      </td>
      <td style="padding:11px 0;font-size:14px;font-weight:600;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">${currency}${total.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const hasTax      = parseFloat(sale.tax ?? "0") > 0;
  const hasDiscount = parseFloat(sale.discount ?? "0") > 0;

  const pmIcons: Record<string, string> = {
    cash: "&#128181;", card: "&#128179;", gcash: "&#128242;", maya: "&#128242;",
    paymongo: "&#128179;", credit: "&#128179;", debit: "&#128179;",
  };
  const pmIcon = pmIcons[(sale.paymentMethod ?? "cash").toLowerCase()] ?? "&#128181;";

  const body = `
  <tr>
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(37,99,235,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Store header -->
        <tr>
          <td align="center" style="background-color:#2563eb;padding:32px 40px 28px;" class="px-m">
            <div style="display:inline-block;background-color:rgba(255,255,255,0.2);border-radius:16px;width:56px;height:56px;text-align:center;line-height:56px;font-size:26px;font-weight:900;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin-bottom:10px;">${storeInit}</div>
            <p style="margin:0 0 2px;font-size:22px;font-weight:800;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${storeName}</p>
            ${storeAddr  ? `<p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128205;&nbsp;${storeAddr}</p>` : ""}
            ${storePhone ? `<p style="margin:3px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128222;&nbsp;${storePhone}</p>` : ""}
          </td>
        </tr>

        <!-- Receipt heading -->
        <tr>
          <td style="padding:24px 40px 0;" class="px-m">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:bottom;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:#0f0a1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;">&#129534;&nbsp;Your receipt</p>
                  ${customer ? `<p style="margin:5px 0 0;font-size:14px;color:#4b5563;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Hello, <strong>${customer}</strong>! Thanks for your purchase.</p>` : ""}
                </td>
                <td style="text-align:right;vertical-align:top;">
                  ${refNum ? `<p style="margin:0;font-size:10px;font-weight:700;color:#2563eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.6px;">Receipt</p><p style="margin:2px 0 0;font-size:14px;color:#0f0a1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;">#${refNum}</p>` : ""}
                  <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${dateStr}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items table -->
        <tr>
          <td style="padding:20px 40px 0;" class="px-m">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="padding:0 0 10px;font-size:11px;font-weight:700;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.8px;border-bottom:2px solid #e5e7eb;">Item</td>
                <td style="padding:0 0 10px;font-size:11px;font-weight:700;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.8px;border-bottom:2px solid #e5e7eb;text-align:right;">Amount</td>
              </tr>
              ${itemRows || `<tr><td colspan="2" style="padding:16px 0;font-size:13px;color:#9ca3af;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">No items</td></tr>`}
            </table>
          </td>
        </tr>

        <!-- Subtotals -->
        ${(hasTax || hasDiscount) ? `
        <tr>
          <td style="padding:12px 40px 0;" class="px-m">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              ${hasTax ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Subtotal</td>
                <td style="padding:4px 0;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:right;">${fmt(sale.subtotal)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Tax</td>
                <td style="padding:4px 0;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:right;">${fmt(sale.tax)}</td>
              </tr>` : ""}
              ${hasDiscount ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;color:#dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Discount</td>
                <td style="padding:4px 0;font-size:13px;color:#dc2626;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:right;">-${fmt(sale.discount)}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>` : ""}

        <!-- Total box -->
        <tr>
          <td style="padding:16px 40px 28px;" class="px-m">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="background-color:#f0f7ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:18px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#2563eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.6px;">Total paid</p>
                      </td>
                      <td style="text-align:right;vertical-align:middle;">
                        <p style="margin:0;font-size:28px;font-weight:900;color:#2563eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.5px;">${fmt(sale.total)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding-top:10px;border-top:1px solid #eff6ff;">
                        <p style="margin:8px 0 0;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${pmIcon}&nbsp;Paid via <strong style="color:#374151;text-transform:capitalize;">${pm}</strong></p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${storeFooter ? `
        <!-- Footer message -->
        <tr>
          <td style="padding:0 40px 24px;text-align:center;border-top:1px dashed #e5e7eb;" class="px-m">
            <p style="margin:20px 0 0;font-size:13px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-style:italic;line-height:1.6;">&ldquo;${storeFooter}&rdquo;</p>
          </td>
        </tr>` : ""}

        <!-- Powered by -->
        <tr>
          <td align="center" style="background-color:#f0f7ff;border-top:1px solid #f3f4f6;padding:14px 24px;">
            <p style="margin:0;font-size:12px;color:#93c5fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Powered by <strong style="color:#2563eb;">ArtixPOS</strong></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${globalFooter()}`;

  return emailShell(body, `Thanks for your purchase at ${store.name}! Here's your receipt.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Send functions (use the HTML builders above)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Confirm your ArtixPOS email address",
    text: [
      "ArtixPOS — Confirm your email address",
      "=".repeat(42),
      "",
      "Thanks for signing up! Click the link below to verify your",
      "email address and activate your account.",
      "This link expires in 24 hours.",
      "",
      verifyUrl,
      "",
      "If you didn't create an ArtixPOS account, you can safely",
      "ignore this email — no account will be created without confirmation.",
      "",
      "— The ArtixPOS Team | https://artixpos.com",
    ].join("\n"),
    html: buildVerificationEmailHtml(verifyUrl),
    headers: { "X-Entity-Ref-ID": `verify-${Date.now()}`, "Precedence": "bulk" },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: "Reset your ArtixPOS password",
    text: [
      "ArtixPOS — Reset your password",
      "=".repeat(42),
      "",
      "We received a request to reset the password for your ArtixPOS",
      "account. Click the link below to choose a new password.",
      "This link expires in 1 hour.",
      "",
      resetUrl,
      "",
      "WHAT HAPPENS NEXT",
      "1. Click the link above within 1 hour",
      "2. Enter and confirm your new password",
      "3. Sign back in to your account",
      "",
      "Didn't request this? You can safely ignore this email — your password won't change.",
      "Need help? support@artixpos.com",
      "",
      "— The ArtixPOS Team | https://artixpos.com",
    ].join("\n"),
    html: buildPasswordResetEmailHtml(resetUrl),
    headers: { "X-Entity-Ref-ID": `reset-${Date.now()}`, "Precedence": "bulk" },
  });
}

export function buildWelcomeEmailHtml(name: string, dashboardUrl: string): string {
  const safeName = escHtml(name);
  const body = `
  <tr>
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(37,99,235,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Purple hero -->
        <tr>
          <td style="background-color:#2563eb;padding:36px 40px 32px;" class="px-m">
            <!-- Logo -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:rgba(255,255,255,0.18);border-radius:12px;width:42px;height:42px;text-align:center;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:42px;display:inline-block;width:42px;">A</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;opacity:0.95;">Artix<span style="opacity:0.65;">POS</span></span>
                </td>
              </tr>
            </table>
            <!-- Heading -->
            <p style="margin:0;font-size:32px;font-weight:800;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.15;letter-spacing:-0.6px;">Welcome to<br>ArtixPOS, ${safeName}!</p>
            <p style="margin:10px 0 0;font-size:15px;color:rgba(255,255,255,0.75);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;">Your business OS is ready to go</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 40px;" class="px-m">

            <!-- Status badge -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#eff6ff;border:1.5px solid #93c5fd;border-radius:50px;padding:8px 18px 8px 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:16px;line-height:1;padding-right:8px;">&#127881;</td>
                      <td style="font-size:13px;font-weight:600;color:#1d4ed8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Account successfully created</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;font-size:15px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.75;">
              Hi <strong style="color:#0f0a1e;">${safeName}</strong>, welcome aboard! You now have access to everything you need to run your business — from sales and inventory to staff, reports, and more.
            </p>

            <!-- Feature list -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:32px;">
              <tr>
                <td style="background-color:#f0f7ff;border-radius:14px;padding:20px 24px;">
                  <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#1d4ed8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.6px;">What you can do with ArtixPOS</p>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128176;&nbsp; <strong>Point of Sale</strong> — fast checkout with offline support</td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128202;&nbsp; <strong>Analytics &amp; Reports</strong> — real-time sales insights</td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128230;&nbsp; <strong>Inventory</strong> — track stock across all branches</td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128101;&nbsp; <strong>Staff &amp; Payroll</strong> — manage your team and schedules</td>
                    </tr>
                    <tr>
                      <td style="padding:5px 0;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">&#128203;&nbsp; <strong>Customers &amp; Memberships</strong> — loyalty and CRM tools</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
              <tr><td>${ctaButton("Go to my dashboard", dashboardUrl)}</td></tr>
            </table>

            <!-- Help box -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:28px;">
              <tr>
                <td style="background-color:#f0f7ff;border-left:3px solid #2563eb;border-radius:0 10px 10px 0;padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#4b5563;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
                    &#128172;&nbsp; <strong style="color:#1f2937;">Need help getting started?</strong> Reply to this email or visit <a href="https://artixpos.com" style="color:#2563eb;text-decoration:none;">artixpos.com</a> — we're here for you.
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${globalFooter()}`;

  return emailShell(body, `Welcome to ArtixPOS, ${name}!`);
}

export async function sendWelcomeEmail(to: string, name: string, dashboardUrl: string): Promise<boolean> {
  return sendEmail({
    to,
    subject: `Welcome to ArtixPOS, ${name}! 🎉`,
    text: [
      `Welcome to ArtixPOS, ${name}!`,
      "=".repeat(42),
      "",
      `Hi ${name}, welcome aboard! Your ArtixPOS account is ready.`,
      "",
      "With ArtixPOS you can:",
      "  • Point of Sale — fast checkout with offline support",
      "  • Analytics & Reports — real-time sales insights",
      "  • Inventory — track stock across all branches",
      "  • Staff & Payroll — manage your team and schedules",
      "  • Customers & Memberships — loyalty and CRM tools",
      "",
      "Go to your dashboard:",
      dashboardUrl,
      "",
      "Need help? Reply to this email — we're here for you.",
      "",
      "— The ArtixPOS Team | https://artixpos.com",
    ].join("\n"),
    html: buildWelcomeEmailHtml(name, dashboardUrl),
    headers: { "X-Entity-Ref-ID": `welcome-${Date.now()}`, "Precedence": "bulk" },
  });
}

export async function sendReceiptEmail(
  to: string,
  sale: ReceiptEmailData,
  store: StoreInfo
): Promise<boolean> {
  const currency = store.currency ?? "₱";
  const fmt = (v: string | null | undefined) => `${currency}${parseFloat(v ?? "0").toFixed(2)}`;
  const refNum = sale.orNumber ?? sale.receiptNumber ?? "";
  const dateStr = new Date(sale.createdAt).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });
  const items = Array.isArray(sale.items) ? (sale.items as any[]) : [];
  const itemLines = items.map((item: any) => {
    const name  = item?.product?.name ?? item?.name ?? item?.title ?? "Item";
    const size  = item?.size?.name ? ` (${item.size.name})` : "";
    const qty   = item?.quantity ?? 1;
    const price = parseFloat(item?.size?.price ?? item?.product?.price ?? item?.price ?? "0");
    const mods  = (item?.modifiers ?? []).reduce((s: number, m: any) => s + parseFloat(m?.price ?? "0"), 0);
    return `  ${name}${size}${qty > 1 ? ` x${qty}` : ""}  ${currency}${((price + mods) * qty).toFixed(2)}`;
  });
  const hasTax = parseFloat(sale.tax ?? "0") > 0;
  const hasDiscount = parseFloat(sale.discount ?? "0") > 0;

  return sendEmail({
    to,
    subject: `Your receipt from ${store.name}`,
    text: [
      `Receipt from ${store.name}`,
      "=".repeat(42),
      ...(refNum ? [`Receipt #${refNum}`] : []),
      dateStr,
      ...(sale.customerName ? [`Customer: ${sale.customerName}`] : []),
      "",
      "ITEMS",
      "-".repeat(28),
      ...itemLines,
      "-".repeat(28),
      ...(hasTax ? [`Subtotal: ${fmt(sale.subtotal)}`, `Tax:      ${fmt(sale.tax)}`] : []),
      ...(hasDiscount ? [`Discount: -${fmt(sale.discount)}`] : []),
      `TOTAL:    ${fmt(sale.total)}`,
      `Payment:  ${sale.paymentMethod}`,
      "",
      ...(store.address ? [store.address] : []),
      ...(store.phone   ? [store.phone]   : []),
      ...(store.receiptFooter ? ["", store.receiptFooter] : []),
      "",
      "Powered by ArtixPOS — https://artixpos.com",
    ].join("\n"),
    html: buildReceiptEmailHtml(sale, store),
    headers: { "X-Entity-Ref-ID": `receipt-${refNum || Date.now()}`, "Precedence": "bulk" },
  });
}
