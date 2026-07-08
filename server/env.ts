const REQUIRED: Record<string, string> = {
  SESSION_SECRET:
    "JWT signing secret — generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
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
    const msg = `[env] ⚠  Missing required environment variables:\n\n${lines}`;
    console.warn(msg);
    if (process.env.VERCEL !== "1") process.exit(1);
  }

  const dbUrl =
    process.env.SUPABASE_POOLER_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL;
  if (!dbUrl) {
    console.warn("[env] ⚠  No database connection string found.");
    if (process.env.VERCEL !== "1") process.exit(1);
  }

  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length < 32) {
    console.warn("[env] ⚠  SESSION_SECRET is too short (must be ≥ 32 characters).");
    if (process.env.VERCEL !== "1") process.exit(1);
  }

  const missingRec = Object.entries(RECOMMENDED).filter(([k]) => !process.env[k]);
  if (missingRec.length > 0) {
    console.warn(`[env] ⚠  Optional vars not set: ${missingRec.map(([k]) => k).join(", ")}`);
  }

  console.log("[env] ✓ Environment validated");
}
