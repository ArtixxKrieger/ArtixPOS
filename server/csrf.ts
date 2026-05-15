import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

export const CSRF_COOKIE  = "csrf_token";
export const CSRF_HEADER  = "x-csrf-token";

const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Only these methods can modify server state — we enforce a token on them.
const UNSAFE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Routes that are exempt from CSRF validation:
//   • OAuth callbacks — already protected by HMAC-signed state parameter.
//   • Native (Capacitor) clients — detected via Bearer token; they never
//     attach cookies, making cookie-based CSRF impossible by definition.
const CSRF_EXEMPT_PREFIXES = ["/auth/google", "/auth/facebook"];

function generate(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Sets a readable (non-httpOnly) CSRF cookie on every response.
 *
 * The browser can read this cookie via `document.cookie` and include the
 * value as the `X-CSRF-Token` request header.  A cross-origin attacker
 * cannot read the cookie value (SameSite=Strict + browser origin policy),
 * so only the legitimate front-end can produce a matching header.
 *
 * Mount AFTER cookieParser so req.cookies is already populated.
 */
export function csrfCookieMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.cookies[CSRF_COOKIE]) {
    const token = generate();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,                                 // JS must be able to read it
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",                              // Stricter than the auth cookie
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });
    req._csrfToken = token;
  } else {
    req._csrfToken = req.cookies[CSRF_COOKIE];
  }
  next();
}

/**
 * Validates the CSRF double-submit on every state-changing request.
 *
 * Exempt cases:
 *   1. Safe HTTP methods (GET, HEAD, OPTIONS).
 *   2. OAuth callback routes (HMAC-protected state).
 *   3. Native Capacitor clients — they send `Authorization: Bearer <jwt>`
 *      and never use cookies, so CSRF via cookie-hijacking is impossible.
 *
 * Mount AFTER jwtAuthMiddleware so req.user (and thus the Bearer check)
 * is already resolved.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const isExemptRoute = CSRF_EXEMPT_PREFIXES.some(p => req.path.startsWith(p));
  if (isExemptRoute) return next();

  // Native clients authenticate via Bearer token — inherently CSRF-safe.
  const hasBearer = (req.headers.authorization ?? "").startsWith("Bearer ");
  if (hasBearer) return next();

  const cookieToken  = req._csrfToken;
  const headerToken  = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken) {
    return res.status(403).json({
      message: "CSRF token missing. Refresh the page and try again.",
      code: "CSRF_MISSING",
    });
  }

  // Constant-time comparison prevents timing-based oracle attacks.
  try {
    const a = Buffer.from(cookieToken,  "utf8");
    const b = Buffer.from(headerToken,  "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(403).json({
        message: "Invalid CSRF token. Refresh the page and try again.",
        code: "CSRF_INVALID",
      });
    }
  } catch {
    return res.status(403).json({
      message: "CSRF validation error.",
      code: "CSRF_ERROR",
    });
  }

  next();
}
