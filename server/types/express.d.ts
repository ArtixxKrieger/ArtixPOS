

declare global {
  namespace Express {

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

      isBanned?: boolean;

      tokenJti?: string | null;

      tokenExp?: number | null;

      /** Whether the current session was issued with "remember me" (rem claim). */
      tokenRem?: boolean;

      _csrfToken?: string;

      requestId?: string;
    }
  }
}

export {};
