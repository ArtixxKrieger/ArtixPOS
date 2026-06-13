/**
 * Express namespace augmentation.
 *
 * Declares the shape of custom properties attached to `req` by middleware
 * throughout the app, eliminating the need for `(req as any).*` casts in
 * every route handler.
 *
 * TypeScript picks this file up automatically because it lives inside the
 * compilation root — no explicit tsconfig reference needed.
 */

declare global {
  namespace Express {
    /**
     * Shape of the authenticated user stored on req.user by jwtAuthMiddleware.
     * Fields mirror the JWT payload produced by signToken().
     */
    interface User {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
      provider: string;
      tenantId: string | null;
      role: string;
      activeBranchId: number | null;
      emailVerified?: boolean;
    }

    interface Request {
      /** True when jwtAuthMiddleware detects the user's account is suspended. */
      isBanned?: boolean;
      /** JWT ID — stored by jwtAuthMiddleware so logout can revoke the token. */
      tokenJti?: string | null;
      /** JWT expiry (Unix seconds) — used during logout to set revocation TTL. */
      tokenExp?: number | null;
      /** CSRF double-submit token set by csrfCookieMiddleware. */
      _csrfToken?: string;
      /** Unique correlation ID assigned per request by X-Request-ID middleware. */
      requestId?: string;
    }
  }
}

export {};
