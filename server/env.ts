const REQUIRED: Record<string, string> = {
  SESSION_SECRET:
    'JWT signing secret — generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
  DATABASE_URL: "PostgreSQL connection string — configure in your environment secrets",
};

const RECOMMENDED: Record<string, string> = {
  GROQ_API_KEY: "Groq AI API key (AI assistant)",
  SMTP_HOST: "SMTP server for password reset emails",
  SENTRY_DSN: "Sentry DSN for production error tracking",
};

export function validateEnv(): void {
  if (process.env.NODE_ENV === "test") return;

  const missing = Object.entries(REQUIRED).filter(([k]) => !process.env[k]);

  if (missing.length > 0) {
    const lines = missing.map(([k, hint]) => `  ${k}\n    → ${hint}`).join("\n");
    console.error(`\n[env] ✗ FATAL — Missing required environment variables:\n\n${lines}\n`);
    console.error("[env] Set these via environment secrets before starting the server.\n");
    process.exit(1);
  }

  const secret = process.env.SESSION_SECRET!;
  if (secret.length < 32) {
    console.error(
      "[env] ✗ FATAL — SESSION_SECRET is too short (must be ≥ 32 characters).\n" +
        "       Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
    );
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
