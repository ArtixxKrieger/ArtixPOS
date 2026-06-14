import { db, pool } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runAsAdmin } from "../tenant-context";
import crypto from "crypto";
import { getJwtSecret } from "./core";

export const NATIVE_APP_SCHEME = process.env.NATIVE_APP_SCHEME || "com.artixpos.app";

export async function findOrCreateUser(data: {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string;
  providerId: string;
}): Promise<import("@shared/schema").User> {
  return runAsAdmin(pool, async (adminDb) => {
    const [existing] = await adminDb.select().from(users).where(eq(users.id, data.id));
    if (existing) return existing;

    if (data.email) {
      const [byEmail] = await adminDb
        .select()
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);
      if (byEmail) {
        if (byEmail.id !== data.id) {
          console.log(
            `[auth] findOrCreateUser: linking provider "${data.provider}" to existing account via email match (existing id=${byEmail.id})`,
          );
          try {
            await adminDb
              .update(users)
              .set({
                id: data.id,
                provider: data.provider,
                providerId: data.providerId,
                ...(data.avatar ? { avatar: data.avatar } : {}),
                ...(data.name ? { name: data.name } : {}),
              } as any)
              .where(eq(users.id, byEmail.id));

            const [relinked] = await adminDb
              .select()
              .from(users)
              .where(eq(users.id, data.id))
              .limit(1);
            if (relinked) return relinked;
          } catch (linkErr) {
            console.warn(
              "[auth] Failed to link provider — falling back to original account:",
              (linkErr as Error)?.message ?? String(linkErr),
            );
          }
        }
        return byEmail;
      }
    }

    try {
      await adminDb.insert(users).values(data as any);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.toLowerCase().includes("unique")) throw err;
    }

    const [created] = await adminDb.select().from(users).where(eq(users.id, data.id));
    if (!created) throw new Error(`DB: user not found after insert — id=${data.id}`);
    return created;
  });
}

export function generateState(extra?: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = extra ? `${nonce}|${extra}` : nonce;
  const hmac = crypto.createHmac("sha256", getJwtSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${hmac}`).toString("base64url");
}

export function verifyAndParseState(state: string | undefined): { valid: boolean; extra?: string } {
  if (!state) return { valid: false };
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastColon = decoded.lastIndexOf(":");
    if (lastColon === -1) return { valid: false };
    const payload = decoded.slice(0, lastColon);
    const receivedHmac = decoded.slice(lastColon + 1);
    if (!payload || !receivedHmac) return { valid: false };
    const expectedHmac = crypto.createHmac("sha256", getJwtSecret()).update(payload).digest("hex");
    const a = Buffer.from(receivedHmac.padEnd(64, "0").slice(0, 64), "hex");
    const b = Buffer.from(expectedHmac, "hex");
    if (a.length !== b.length) return { valid: false };
    if (!crypto.timingSafeEqual(a, b)) return { valid: false };
    const pipeIdx = payload.indexOf("|");
    const extra = pipeIdx !== -1 ? payload.slice(pipeIdx + 1) : undefined;
    return { valid: true, extra };
  } catch {
    return { valid: false };
  }
}

export function popupResultPage({ ok, error }: { ok: boolean; error?: string }): string {
  const payload = ok
    ? JSON.stringify({ type: "google-auth-ok" })
    : JSON.stringify({ type: "google-auth-error", error: error ?? "unknown" });

  const errorText = error
    ? error.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : "unknown";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ArtixPOS</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#09090f;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px;padding:32px;text-align:center}
.logo{width:60px;height:60px;border-radius:18px;background:#7c3aed;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;letter-spacing:-1px;flex-shrink:0}
.app-name{font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px}
.dots{display:flex;gap:7px;margin-top:4px}
.dot{width:8px;height:8px;border-radius:50%;background:#7c3aed;animation:bop 1.2s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.2s}
.dot:nth-child(3){animation-delay:.4s}
@keyframes bop{0%,80%,100%{transform:scale(.55);opacity:.35}40%{transform:scale(1);opacity:1}}
.msg{font-size:13px;color:#6b7280;margin-top:4px}
.err-icon{font-size:36px;margin-bottom:4px}
.err-text{color:#f87171;font-size:14px;line-height:1.6;max-width:300px}
.btn{margin-top:12px;display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 28px;border-radius:10px;font-size:14px;font-weight:600}
</style>
</head>
<body>
${
  ok
    ? `
<div class="logo">A</div>
<div class="app-name">ArtixPOS</div>
<div class="dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
<p class="msg">Signing you in\u2026</p>
`
    : `
<div class="err-icon">\u26A0\uFE0F</div>
<p class="err-text">Sign-in failed${error ? `: ${errorText}` : ""}.<br>Close this window and try again.</p>
<a href="/login" class="btn">Back to login</a>
`
}
<script>
(function(){
  ${
    ok
      ? `
  // Try to send the result to the parent window (desktop popup flow).
  var sent = false;
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, "*");
      sent = true;
    }
  } catch(e) {}

  if (sent) {
    // Desktop popup: close after a short delay so the parent can process the message.
    setTimeout(function(){ try { window.close(); } catch(e) {} }, 500);
    // Fallback: if the browser blocks window.close() (Chrome sometimes does),
    // redirect this tab to the app so the user is never left stuck here.
    setTimeout(function(){
      try {
        if (!window.closed) { window.location.replace("/"); }
      } catch(e) { window.location.replace("/"); }
    }, 2000);
  } else {
    // Mobile / opener unavailable: the cookie is already set on our origin.
    // Redirect the current tab (the "popup") straight to the app.
    // React will pick up the auth cookie and land the user on the dashboard.
    window.location.replace("/");
  }
  `
      : `
  // Error: try to notify opener, stay on error page if running standalone.
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(${payload}, "*");
      setTimeout(function(){ try { window.close(); } catch(e) {} }, 500);
    }
  } catch(e) {}
  `
  }
})();
</script>
</body>
</html>`;
}
