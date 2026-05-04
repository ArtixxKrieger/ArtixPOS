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

// ── BIR-Compliant Z-Report (End-of-Day) Email ─────────────────────────────────

export interface ZReportEmailData {
  storeName: string;
  tin: string;
  ptuNumber: string;
  accreditationNumber: string;
  machineSerialNumber: string;
  shiftId: number;
  openedAt: string;
  closedAt: string;
  // OR range
  orFrom: string | null;
  orTo: string | null;
  // Totals
  totalTransactions: number;
  grossSales: number;
  totalDiscount: number;
  totalLoyaltyDiscount: number;
  netSales: number;
  // VAT breakdown
  vatableSalesTotal: number;
  vatExemptTotal: number;
  zeroRatedTotal: number;
  vatAmountTotal: number;
  // SC/PWD
  scPwdCount: number;
  scPwdDiscount: number;
  // Voids
  voidCount: number;
  voidAmount: number;
  // Refunds
  refundCount: number;
  refundAmount: number;
  // Payment methods
  paymentBreakdown: Record<string, { count: number; total: number }>;
  // Cashier / branch info
  cashierName?: string;
  branchName?: string;
}

function fmt(n: number, currency = "PHP"): string {
  return `${currency} ${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function paymentRows(pb: Record<string, { count: number; total: number }>): string {
  return Object.entries(pb)
    .map(
      ([method, { count, total }]) => `
        <tr>
          <td style="padding:6px 12px;text-transform:capitalize;color:#374151">${method}</td>
          <td style="padding:6px 12px;text-align:center;color:#374151">${count}</td>
          <td style="padding:6px 12px;text-align:right;font-family:monospace;color:#374151">${fmt(total)}</td>
        </tr>`
    )
    .join("");
}

export async function sendZReportEmail(to: string, d: ZReportEmailData): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[z-report-email] SMTP not configured — skipping Z-report email");
    return false;
  }

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@artixpos.com";
  const reportDate = fmtDate(d.closedAt);
  const currency = "PHP";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:28px 32px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;color:#c4b5fd;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600">BIR-Compliant Z-Report</p>
            <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:700">End-of-Day Summary</h1>
          </td>
          <td align="right" style="vertical-align:top">
            <span style="display:inline-block;background:rgba(255,255,255,.15);color:#e9d5ff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:1px">SHIFT #${d.shiftId}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Business Info -->
  <tr>
    <td style="padding:20px 32px;background:#faf5ff;border-bottom:1px solid #ede9fe">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:50%;vertical-align:top">
            <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1e1b4b">${d.storeName || "Store"}</p>
            ${d.branchName ? `<p style="margin:0 0 2px;font-size:12px;color:#6b7280">Branch: ${d.branchName}</p>` : ""}
            <p style="margin:0;font-size:11px;color:#9ca3af">Generated: ${reportDate}</p>
          </td>
          <td style="width:50%;text-align:right;vertical-align:top">
            ${d.tin ? `<p style="margin:0 0 2px;font-size:11px;color:#6b7280"><span style="font-weight:600">TIN:</span> ${d.tin}</p>` : ""}
            ${d.ptuNumber ? `<p style="margin:0 0 2px;font-size:11px;color:#6b7280"><span style="font-weight:600">PTU No.:</span> ${d.ptuNumber}</p>` : ""}
            ${d.accreditationNumber ? `<p style="margin:0 0 2px;font-size:11px;color:#6b7280"><span style="font-weight:600">Accreditation No.:</span> ${d.accreditationNumber}</p>` : ""}
            ${d.machineSerialNumber ? `<p style="margin:0;font-size:11px;color:#6b7280"><span style="font-weight:600">Machine S/N:</span> ${d.machineSerialNumber}</p>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Shift Period -->
  <tr>
    <td style="padding:16px 32px;border-bottom:1px solid #f3f4f6">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:50%">
            <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:600">Shift Opened</p>
            <p style="margin:0;font-size:13px;color:#111827;font-weight:500">${fmtDate(d.openedAt)}</p>
          </td>
          <td style="width:50%;text-align:right">
            <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:600">Shift Closed</p>
            <p style="margin:0;font-size:13px;color:#111827;font-weight:500">${fmtDate(d.closedAt)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- OR Range Banner -->
  <tr>
    <td style="padding:16px 32px;background:#eff6ff;border-bottom:1px solid #dbeafe">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <p style="margin:0 0 4px;font-size:10px;color:#3b82f6;text-transform:uppercase;letter-spacing:1.5px;font-weight:700">Official Receipt (OR) Range</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#1e40af;font-family:monospace;letter-spacing:1px">
              ${d.orFrom ?? "—"} &nbsp;→&nbsp; ${d.orTo ?? "—"}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Sales Summary Cards -->
  <tr>
    <td style="padding:24px 32px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px">Sales Summary</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:50%;padding-right:8px;vertical-align:top">
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:8px">
              <p style="margin:0 0 2px;font-size:10px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:1px">Total Transactions</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#111827">${d.totalTransactions}</p>
            </div>
          </td>
          <td style="width:50%;padding-left:8px;vertical-align:top">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:8px">
              <p style="margin:0 0 2px;font-size:10px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:1px">Gross Sales</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#15803d">${fmt(d.grossSales, currency)}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%;padding-right:8px;vertical-align:top">
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px">
              <p style="margin:0 0 2px;font-size:10px;color:#ea580c;font-weight:600;text-transform:uppercase;letter-spacing:1px">Total Discounts</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#c2410c">${fmt(d.totalDiscount + d.totalLoyaltyDiscount, currency)}</p>
            </div>
          </td>
          <td style="width:50%;padding-left:8px;vertical-align:top">
            <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 16px">
              <p style="margin:0 0 2px;font-size:10px;color:#0284c7;font-weight:600;text-transform:uppercase;letter-spacing:1px">Net Sales</p>
              <p style="margin:0;font-size:18px;font-weight:700;color:#0369a1">${fmt(d.netSales, currency)}</p>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- VAT Breakdown -->
  <tr>
    <td style="padding:20px 32px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px">BIR VAT Breakdown</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px">Category</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px">Amount</th>
        </tr>
        <tr style="border-top:1px solid #e5e7eb">
          <td style="padding:8px 12px;font-size:13px;color:#374151">VATable Sales</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;color:#374151">${fmt(d.vatableSalesTotal, currency)}</td>
        </tr>
        <tr style="border-top:1px solid #e5e7eb;background:#fafafa">
          <td style="padding:8px 12px;font-size:13px;color:#374151">Output VAT (12%)</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;color:#374151">${fmt(d.vatAmountTotal, currency)}</td>
        </tr>
        <tr style="border-top:1px solid #e5e7eb">
          <td style="padding:8px 12px;font-size:13px;color:#374151">VAT-Exempt Sales</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;color:#374151">${fmt(d.vatExemptTotal, currency)}</td>
        </tr>
        <tr style="border-top:1px solid #e5e7eb;background:#fafafa">
          <td style="padding:8px 12px;font-size:13px;color:#374151">Zero-Rated Sales</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;color:#374151">${fmt(d.zeroRatedTotal, currency)}</td>
        </tr>
        <tr style="border-top:2px solid #d1d5db;background:#f9fafb">
          <td style="padding:10px 12px;font-size:13px;font-weight:700;color:#111827">Gross Sales (incl. VAT)</td>
          <td style="padding:10px 12px;text-align:right;font-family:monospace;font-size:13px;font-weight:700;color:#111827">${fmt(d.grossSales, currency)}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- SC/PWD Discounts -->
  ${(d.scPwdCount > 0) ? `
  <tr>
    <td style="padding:16px 32px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px">Senior Citizen / PWD Discounts</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px;overflow:hidden">
        <tr>
          <td style="padding:10px 14px;font-size:13px;color:#7e22ce">SC/PWD Transactions</td>
          <td style="padding:10px 14px;text-align:right;font-size:13px;font-weight:700;color:#7e22ce">${d.scPwdCount}</td>
        </tr>
        <tr style="border-top:1px solid #e9d5ff">
          <td style="padding:10px 14px;font-size:13px;color:#7e22ce">Total SC/PWD Discount</td>
          <td style="padding:10px 14px;text-align:right;font-size:13px;font-weight:700;color:#7e22ce">${fmt(d.scPwdDiscount, currency)}</td>
        </tr>
      </table>
    </td>
  </tr>` : ""}

  <!-- Voids & Refunds -->
  <tr>
    <td style="padding:16px 32px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px">Voids &amp; Refunds</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <tr style="background:#fef2f2">
          <td style="padding:8px 12px;font-size:13px;color:#991b1b">Voided Transactions</td>
          <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:#991b1b">${d.voidCount}</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;font-weight:700;color:#991b1b">${fmt(d.voidAmount, currency)}</td>
        </tr>
        <tr style="border-top:1px solid #e5e7eb;background:#fff7ed">
          <td style="padding:8px 12px;font-size:13px;color:#92400e">Refunds Processed</td>
          <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:#92400e">${d.refundCount}</td>
          <td style="padding:8px 12px;text-align:right;font-family:monospace;font-size:13px;font-weight:700;color:#92400e">${fmt(d.refundAmount, currency)}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Payment Breakdown -->
  <tr>
    <td style="padding:20px 32px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px">Payment Method Breakdown</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px">Method</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px">Count</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:1px">Amount</th>
        </tr>
        ${paymentRows(d.paymentBreakdown)}
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-align:center">
        This Z-Report was automatically generated by <strong>ArtixPOS</strong> upon shift close.
      </p>
      <p style="margin:0;font-size:10px;color:#d1d5db;text-align:center">
        For BIR filing purposes. Keep this record for your books of accounts.
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject: `[ArtixPOS] Z-Report — ${d.storeName || "Store"} · Shift #${d.shiftId} · ${new Date(d.closedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" })}`,
      html,
    });
    console.log(`[z-report-email] Sent to ${to} for shift #${d.shiftId}`);
    return true;
  } catch (err: any) {
    console.error(`[z-report-email] Failed to send: ${err?.message}`);
    return false;
  }
}
