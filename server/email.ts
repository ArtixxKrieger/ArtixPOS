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
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpPass?.startsWith("re_")) return smtpPass;
  return null;
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

// ─── Unified send helper ──────────────────────────────────────────────────────
// Tries Resend HTTP API (via native fetch) first; falls back to nodemailer SMTP.
// Returns true on success, false on any failure (never throws).
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
  if (resendKey) {
    // Use Resend's REST API directly — no npm package, no lockfile issues.
    // A single HTTPS POST, works perfectly in Vercel serverless.
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [opts.to],
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
          headers: opts.headers,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "(unreadable)");
        console.error(`[email] Resend API error ${res.status}:`, body);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[email] Resend fetch failed:", err);
      return false;
    }
  }

  // SMTP fallback — for non-Resend providers
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[email] No email transport configured (SMTP_HOST/USER/PASS or RESEND_API_KEY missing)");
    return false;
  }
  try {
    await transporter.sendMail({ from, ...opts });
    return true;
  } catch (err) {
    console.error("[email] SMTP sendMail failed:", err);
    return false;
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
    body{margin:0;padding:0;background-color:#ede9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;}
    .email-container{max-width:600px;margin:0 auto;}
    a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
    @media only screen and (max-width:600px){
      .email-container{width:100%!important;}
      .px-m{padding-left:20px!important;padding-right:20px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ede9ff;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(previewText)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>` : ""}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#ede9ff;">
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
function ctaButton(label: string, url: string, color = "#7c3aed"): string {
  return `
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
    href="${url}" style="height:50px;v-text-anchor:middle;width:230px;" arcsize="16%" stroke="f" fillcolor="${color}">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;">${label}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <a href="${url}" style="display:inline-block;background-color:${color};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;letter-spacing:0.2px;line-height:1;padding:15px 40px;text-decoration:none;border-radius:10px;mso-hide:all;">${label}</a>
  <!--<![endif]-->`;
}

function globalFooter(): string {
  return `
  <tr>
    <td align="center" style="padding:28px 0 0;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6d28d9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.3px;">ArtixPOS</p>
      <p style="margin:0;font-size:12px;color:#a78bfa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
        Your industry. Your POS. &mdash; <a href="https://artixpos.com" style="color:#7c3aed;text-decoration:none;">artixpos.com</a>
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
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(109,40,217,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Purple hero -->
        <tr>
          <td style="background-color:#7c3aed;padding:36px 40px 32px;" class="px-m">
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
                <td style="background-color:#faf8ff;border-left:3px solid #7c3aed;border-radius:0 10px 10px 0;padding:14px 18px;">
                  <p style="margin:0;font-size:13px;color:#4b5563;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;">
                    &#128274;&nbsp; <strong style="color:#1f2937;">Security tip:</strong> If you didn't create an ArtixPOS account, you can safely ignore this email. No account will be created without confirmation.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:0;font-size:12px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;">
              Button not working? Copy and paste this URL into your browser:<br>
              <a href="${verifyUrl}" style="color:#7c3aed;word-break:break-all;font-size:11px;">${safeUrl}</a>
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
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(109,40,217,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Dark header -->
        <tr>
          <td style="background-color:#0f0a1e;padding:32px 40px 28px;" class="px-m">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
              <tr>
                <td style="background-color:#7c3aed;border-radius:12px;width:42px;height:42px;text-align:center;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:42px;display:inline-block;width:42px;">A</span>
                </td>
                <td style="padding-left:10px;vertical-align:middle;">
                  <span style="font-size:20px;font-weight:900;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.3px;">Artix<span style="color:#7c3aed;">POS</span></span>
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
                        <td style="width:24px;height:24px;background-color:#7c3aed;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:24px;">1</td>
                        <td style="padding-left:12px;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Click the button above within <strong>1 hour</strong></td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding:5px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:24px;height:24px;background-color:#7c3aed;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:24px;">2</td>
                        <td style="padding-left:12px;font-size:14px;color:#374151;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Enter and confirm your new password</td>
                      </tr></table>
                    </td></tr>
                    <tr><td style="padding:5px 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td style="width:24px;height:24px;background-color:#7c3aed;border-radius:50%;text-align:center;vertical-align:middle;font-size:11px;font-weight:700;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:24px;">3</td>
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
              <a href="${resetUrl}" style="color:#7c3aed;word-break:break-all;font-size:11px;">${safeUrl}</a>
            </p>

            <!-- Security note -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="border-top:1px solid #f3f4f6;padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.7;">
                    &#128274;&nbsp; Didn't request this? Ignore this email — your password won't change. Need help? <a href="mailto:support@artixpos.com" style="color:#7c3aed;">support@artixpos.com</a>
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
    <td style="background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(109,40,217,0.12);">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">

        <!-- Store header -->
        <tr>
          <td align="center" style="background-color:#7c3aed;padding:32px 40px 28px;" class="px-m">
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
                  ${refNum ? `<p style="margin:0;font-size:10px;font-weight:700;color:#7c3aed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.6px;">Receipt</p><p style="margin:2px 0 0;font-size:14px;color:#0f0a1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-weight:700;">#${refNum}</p>` : ""}
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
                <td style="background-color:#faf8ff;border:1.5px solid #ddd6fe;border-radius:14px;padding:18px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td style="vertical-align:middle;">
                        <p style="margin:0;font-size:11px;font-weight:700;color:#7c3aed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-transform:uppercase;letter-spacing:0.6px;">Total paid</p>
                      </td>
                      <td style="text-align:right;vertical-align:middle;">
                        <p style="margin:0;font-size:28px;font-weight:900;color:#7c3aed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:-0.5px;">${fmt(sale.total)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding-top:10px;border-top:1px solid #ede9ff;">
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
          <td align="center" style="background-color:#faf8ff;border-top:1px solid #f3f4f6;padding:14px 24px;">
            <p style="margin:0;font-size:12px;color:#c4b5fd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Powered by <strong style="color:#7c3aed;">ArtixPOS</strong></p>
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
