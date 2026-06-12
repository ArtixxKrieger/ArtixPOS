const REQUIRED: Record<string, string> = {
  SESSION_SECRET:
    'JWT signing secret — generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
};

const RECOMMENDED: Record<string, string> = {
  SMTP_HOST: "SMTP server for password reset emails",
  SENTRY_DSN: "Sentry DSN for production error tracking",
};

export function validateEnv(): void {
  if (process.env.NODE_ENV === "test") return;

  const missing = Object.entries(REQUIRED).filter(([k]) => !process.env[k]);

  if (missing.length > 0) {
    const lines = missing.map(([k, hint]) => `  ${k}\n    → ${hint}`).join("\n");
    const msg = `[env] ✗ FATAL — Missing required environment variables:\n\n${lines}\n\n[env] Set these via environment secrets before starting the server.`;
    console.error(msg);
    if (process.env.VERCEL === "1") {
      throw new Error(msg);
    }
    process.exit(1);
  }

  // Accept any of the supported DB connection string env var names
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_POOLER_URL ||
    process.env.SUPABASE_DATABASE_URL;
  if (!dbUrl) {
    const msg =
      "[env] ✗ FATAL — No database connection string found.\n" +
      "       Set DATABASE_URL or SUPABASE_POOLER_URL in your environment secrets.";
    console.error(msg);
    if (process.env.VERCEL === "1") {
      throw new Error(msg);
    }
    process.exit(1);
  }

  const secret = process.env.SESSION_SECRET!;
  if (secret.length < 32) {
    const msg =
      "[env] ✗ FATAL — SESSION_SECRET is too short (must be ≥ 32 characters).\n" +
      "       Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"";
    console.error(msg);
    if (process.env.VERCEL === "1") {
      throw new Error(msg);
    }
    process.exit(1);
  }

  const missingRec = Object.entries(RECOMMENDED).filter(([k]) => !process.env[k]);
  if (missingRec.length > 0) {
    console.warn(
      `[env] ⚠  Optional vars not set: ${missingRec.map(([k]) => k).join(", ")}`,
    );
  }

  console.log("[env] ✓ Environment validated");
}
