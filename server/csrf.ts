import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

export const CSRF_COOKIE  = "csrf_token";
export const CSRF_HEADER  = "x-csrf-token";

const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const UNSAFE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

const CSRF_EXEMPT_PREFIXES = ["/auth/google", "/auth/facebook", "/api/csp-report", "/api/client-errors"];

function generate(): string {
  return randomBytes(32).toString("hex");
}

export function csrfCookieMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let token: string;
  if (!req.cookies[CSRF_COOKIE]) {
    token = generate();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: true,
      sameSite: "none" as const,
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });
  } else {
    token = req.cookies[CSRF_COOKIE];
  }
  req._csrfToken = token;
  // Echo the token in a response header so the client can read it even when
  // document.cookie is unavailable (e.g. Replit iframe, third-party cookie
  // restrictions in Chrome 120+).  Reading a response header does not require
  // cookie access and works reliably in all iframe contexts.
  res.setHeader("X-CSRF-Token", token);
  next();
}

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const isExemptRoute = CSRF_EXEMPT_PREFIXES.some(p => req.path.startsWith(p));
  if (isExemptRoute) return next();

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
