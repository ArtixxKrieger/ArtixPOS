import nodemailer from "nodemailer";

// Singleton transporter — created once and reused for the lifetime of the process.
// Creating a new transport per call wastes connection-pool resources and slows down
// every email send with a fresh TCP + TLS handshake.
let _transporter: nodemailer.Transporter | null | undefined = undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter !== undefined) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    _transporter = null;
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      // Allow self-signed certs in development but enforce in production
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });

  return _transporter;
}

// Call this after env vars change (e.g. hot-reload in dev) to force re-creation.
export function resetTransporter(): void {
  _transporter = undefined;
}

// Escape user-supplied strings before inserting them into HTML email bodies.
// Prevents store owners from accidentally (or maliciously) injecting HTML tags
// in fields like storeName, address, phone, or receiptFooter.
function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@artixpos.com";
  try {
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
  } catch (err) {
    console.error("[email] sendPasswordResetEmail failed:", err);
    return false;
  }
}

export async function sendVerificationEmail(
  to: string,
  verifyUrl: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@artixpos.com";
  try {
    await transporter.sendMail({
      from,
      to,
      subject: "Confirm your ArtixPOS email address",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <div style="margin-bottom:24px">
            <span style="font-size:22px;font-weight:800;color:#0f0a1e">Artix</span><span style="font-size:22px;font-weight:800;color:#7c3aed">POS</span>
          </div>
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f0a1e">Confirm your email</h2>
          <p style="color:#555;font-size:14px;margin:0 0 24px;line-height:1.6">
            Thanks for signing up! Click the button below to verify your email address
            and activate your account. This link expires in 24 hours.
          </p>
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px">
            Confirm email address
          </a>
          <p style="color:#999;font-size:12px;margin:24px 0 0;line-height:1.6">
            If you didn't create an ArtixPOS account, you can safely ignore this email.
          </p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[email] sendVerificationEmail failed:", err);
    return false;
  }
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

export async function sendReceiptEmail(
  to: string,
  sale: ReceiptEmailData,
  store: StoreInfo
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@artixpos.com";
  const currency = store.currency ?? "₱";
  const fmt = (v: string | null | undefined) =>
    `${currency}${parseFloat(v ?? "0").toFixed(2)}`;

  // Escape all user-supplied store fields before inserting into HTML
  const storeName = escHtml(store.name);
  const storeAddress = escHtml(store.address);
  const storePhone = escHtml(store.phone);
  const storeFooter = escHtml(store.receiptFooter);
  const storeInitial = escHtml(store.name[0]?.toUpperCase());

  const items = Array.isArray(sale.items) ? (sale.items as any[]) : [];
  const itemRows = items
    .map((item: any) => {
      const name = escHtml(item?.product?.name ?? item?.name ?? item?.title ?? "Item");
      const size = item?.size?.name ? ` (${escHtml(item.size.name)})` : "";
      const qty = item?.quantity ?? 1;
      const price = parseFloat(item?.size?.price ?? item?.product?.price ?? item?.price ?? "0");
      const mods = (item?.modifiers ?? []).reduce(
        (s: number, m: any) => s + parseFloat(m?.price ?? "0"),
        0
      );
      const lineTotal = (price + mods) * qty;
      return `
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#333">${name}${size}${qty > 1 ? ` ×${qty}` : ""}</td>
          <td style="padding:6px 0;font-size:13px;color:#333;text-align:right;white-space:nowrap">${currency}${lineTotal.toFixed(2)}</td>
        </tr>`;
    })
    .join("");

  const dateStr = new Date(sale.createdAt).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const refNum = sale.orNumber ?? sale.receiptNumber ?? "";

  try {
    await transporter.sendMail({
      from,
      to,
      subject: `Your receipt from ${storeName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;background:#f9f9fb">
          <div style="background:#fff;border-radius:16px;padding:28px 24px;box-shadow:0 2px 12px rgba(0,0,0,0.06)">
            <div style="text-align:center;margin-bottom:20px">
              <div style="display:inline-block;width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);text-align:center;line-height:40px;color:#fff;font-size:18px;font-weight:900;margin-bottom:8px">
                ${storeInitial}
              </div>
              <h2 style="margin:0;font-size:18px;font-weight:800;color:#0f0a1e">${storeName}</h2>
              ${storeAddress ? `<p style="margin:4px 0 0;font-size:12px;color:#888">${storeAddress}</p>` : ""}
              ${storePhone ? `<p style="margin:2px 0 0;font-size:12px;color:#888">${storePhone}</p>` : ""}
            </div>

            <hr style="border:none;border-top:1px dashed #e0e0e0;margin:16px 0" />

            <p style="margin:0 0 4px;font-size:12px;color:#888">Receipt${refNum ? ` #${escHtml(refNum)}` : ""}</p>
            <p style="margin:0 0 16px;font-size:12px;color:#888">${dateStr}</p>

            <table style="width:100%;border-collapse:collapse">
              ${itemRows}
            </table>

            <hr style="border:none;border-top:1px dashed #e0e0e0;margin:12px 0" />

            <table style="width:100%;border-collapse:collapse;font-size:13px">
              ${parseFloat(sale.tax ?? "0") > 0 ? `
              <tr>
                <td style="padding:3px 0;color:#666">Subtotal</td>
                <td style="padding:3px 0;text-align:right;color:#666">${fmt(sale.subtotal)}</td>
              </tr>
              <tr>
                <td style="padding:3px 0;color:#666">Tax</td>
                <td style="padding:3px 0;text-align:right;color:#666">${fmt(sale.tax)}</td>
              </tr>` : ""}
              ${parseFloat(sale.discount ?? "0") > 0 ? `
              <tr>
                <td style="padding:3px 0;color:#666">Discount</td>
                <td style="padding:3px 0;text-align:right;color:#e53e3e">-${fmt(sale.discount)}</td>
              </tr>` : ""}
              <tr>
                <td style="padding:8px 0 3px;font-size:15px;font-weight:800;color:#0f0a1e">Total</td>
                <td style="padding:8px 0 3px;font-size:15px;font-weight:800;color:#7c3aed;text-align:right">${fmt(sale.total)}</td>
              </tr>
              <tr>
                <td style="padding:3px 0;font-size:12px;color:#888">Payment</td>
                <td style="padding:3px 0;font-size:12px;color:#888;text-align:right;text-transform:capitalize">${escHtml(sale.paymentMethod)}</td>
              </tr>
            </table>

            ${storeFooter ? `
            <hr style="border:none;border-top:1px dashed #e0e0e0;margin:16px 0" />
            <p style="margin:0;text-align:center;font-size:12px;color:#888">${storeFooter}</p>` : ""}
          </div>
          <p style="text-align:center;font-size:11px;color:#bbb;margin-top:16px">Powered by ArtixPOS</p>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error("[email] sendReceiptEmail failed:", err);
    return false;
  }
}
