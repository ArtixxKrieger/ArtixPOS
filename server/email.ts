import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@artixpos.com";

  await transporter.sendMail({
    from,
    to,
    subject: "Reset your ArtixPOS password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:22px;color:#0f0a1e">Reset your password</h2>
        <p style="color:#555;font-size:14px;margin:0 0 24px;line-height:1.6">
          You requested a password reset for your ArtixPOS account. Click the button
          below to set a new password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px">
          Reset password
        </a>
        <p style="color:#999;font-size:12px;margin:24px 0 0;line-height:1.6">
          If you didn't request this, you can safely ignore this email.<br/>
          The link expires in 1 hour.
        </p>
      </div>
    `,
  });

  return true;
}
