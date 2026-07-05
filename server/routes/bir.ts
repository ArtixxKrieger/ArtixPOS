

import type { Express } from "express";
import { createHash } from "crypto";
import { storage } from "../storage";
import { requireAuth, requirePro, requireManagerOrAbove } from "../middleware";
import {
  getBirXReportData,
  getBirSummaryData,
  getBirOrNumbers,
  getBirVoidTrailRows,
  getBirVoidTrailExportRows,
  getBirHashVerifyRows,
  getBirRefundTrailRows,
} from "../infrastructure/persistence/bir";
import { getUserId } from "../lib/route-utils";

export function registerBirRoutes(app: Express): void {

app.get("/api/bir/x-report", requireAuth, requirePro, async (req, res) => {
    const uid = getUserId(req);
    const openShift = await storage.getOpenShift(uid);
    if (!openShift) return res.json({ shift: null });
    const startDate = openShift.openedAt!;

    const { agg, paymentRows, discountRows } = await getBirXReportData(uid, startDate);

    const orMin: bigint | null = agg.or_min as bigint | null ?? null;
    const orMax: bigint | null = agg.or_max as bigint | null ?? null;
    const orFrom = orMin !== null ? String(orMin).padStart(7, "0") : "(none)";
    const orTo   = orMax !== null ? String(orMax).padStart(7, "0") : "(none)";

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const r of paymentRows) {
      paymentBreakdown[r.pm as string] = { count: Number(r.count), total: Number(r.total) };
    }

    const discountBreakdown: Record<string, { count: number; total: number; discount: number }> = {};
    for (const r of discountRows) {
      discountBreakdown[r.dt as string] = { count: Number(r.count), total: Number(r.total), discount: Number(r.discount) };
    }

    const gross = Number(agg.gross_sales ?? 0);
    const vat   = Number(agg.vat_amount  ?? 0);

    res.json({
      shift: openShift,
      orFrom, orTo,
      totalTransactions:    Number(agg.total_txn              ?? 0),
      grossSales:           gross,
      netSales:             gross - vat,
      totalDiscount:        Number(agg.total_discount         ?? 0),
      totalLoyaltyDiscount: Number(agg.total_loyalty_discount ?? 0),
      vatableSalesTotal:    Number(agg.vatable_sales          ?? 0),
      vatExemptTotal:       Number(agg.vat_exempt_sales       ?? 0),
      zeroRatedTotal:       Number(agg.zero_rated_sales       ?? 0),
      vatAmountTotal:       vat,
      paymentBreakdown,
      discountBreakdown,
    });
  });

app.get("/api/bir/summary", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });

    const [year, mon] = month.split("-").map(Number);
    const monStr    = String(mon).padStart(2, "0");
    const lastDay   = new Date(year, mon, 0).getDate();
    const lastDayStr= String(lastDay).padStart(2, "0");
    const startDate = new Date(`${year}-${monStr}-01T00:00:00+08:00`).toISOString();
    const endDate   = new Date(`${year}-${monStr}-${lastDayStr}T23:59:59.999+08:00`).toISOString();
    const uid       = getUserId(req);

    const { agg, paymentRows } = await getBirSummaryData(uid, startDate, endDate);

    const orMin: bigint | null = agg.or_min as bigint | null ?? null;
    const orMax: bigint | null = agg.or_max as bigint | null ?? null;
    const orFrom = orMin !== null ? String(orMin).padStart(7, "0") : "(none)";
    const orTo   = orMax !== null ? String(orMax).padStart(7, "0") : "(none)";

    const paymentBreakdown: Record<string, { count: number; total: number }> = {};
    for (const r of paymentRows) {
      paymentBreakdown[r.pm as string] = { count: Number(r.count), total: Number(r.total) };
    }

    const gross  = Number(agg.gross_sales ?? 0);
    const vat    = Number(agg.output_vat  ?? 0);

    res.json({
      month, orFrom, orTo,
      totalTransactions: Number(agg.total_txn       ?? 0),
      grossSales:        gross,
      netSales:          gross - vat,
      outputVat:         vat,
      vatableSales:      Number(agg.vatable_sales    ?? 0),
      vatExemptSales:    Number(agg.vat_exempt_sales ?? 0),
      zeroRatedSales:    Number(agg.zero_rated_sales ?? 0),
      totalDiscount:     Number(agg.total_discount   ?? 0),
      scPwdCount:        Number(agg.sc_pwd_count     ?? 0),
      scPwdDiscount:     Number(agg.sc_pwd_discount  ?? 0),
      paymentBreakdown,
    });
  });

  app.get("/api/bir/esales-export", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });

    const [year, mon] = month.split("-").map(Number);
    const monStr = String(mon).padStart(2, "0");
    const lastDay = new Date(year, mon, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, "0");
    const startDate = new Date(`${year}-${monStr}-01T00:00:00+08:00`).toISOString();
    const endDate   = new Date(`${year}-${monStr}-${lastDayStr}T23:59:59.999+08:00`).toISOString();

    const uid = getUserId(req);
    const [salesList, settingsData] = await Promise.all([
      storage.getSales(uid, { limit: 10000, startDate, endDate }),
      storage.getSettings(uid),
    ]);

    const tin       = (settingsData as any)?.tin || "";
    const storeName = (settingsData as any)?.storeName || "";
    const ptu       = (settingsData as any)?.ptuNumber || "";
    const accredNo  = (settingsData as any)?.accreditationNumber || "";
    const machSN    = (settingsData as any)?.machineSerialNumber || "";

    const headers = [
      "Date","OR Number","Customer Name","Payment Method",
      "Gross Sales (incl. VAT)","VATable Sales","Output VAT",
      "VAT-Exempt Sales","Zero-Rated Sales","Discount","Discount Type",
      "SC/PWD ID","Net Amount",
    ];
    const rows = salesList.map(s => {
      const date = s.createdAt
        ? new Date(s.createdAt).toLocaleDateString("en-PH", { month:"2-digit", day:"2-digit", year:"numeric", timeZone:"Asia/Manila" })
        : "";
      const netAmount = (parseFloat(s.total || "0") - parseFloat(s.tax || "0")).toFixed(2);
      return [
        date,
        (s as any).orNumber || (s as any).receiptNumber || "",
        s.customerName || "WALK-IN",
        s.paymentMethod || "cash",
        parseFloat(s.total                    || "0").toFixed(2),
        parseFloat((s as any).vatableSales    || "0").toFixed(2),
        parseFloat(s.tax                      || "0").toFixed(2),
        parseFloat((s as any).vatExemptSales  || "0").toFixed(2),
        parseFloat((s as any).zeroRatedSales  || "0").toFixed(2),
        parseFloat(s.discount                 || "0").toFixed(2),
        (s as any).discountType || "regular",
        (s as any).scPwdId || "",
        netAmount,
      ];
    });

    const csv = [
      `# BIR eSales Report`,
      `# Taxpayer: ${storeName}`,
      `# TIN: ${tin}`,
      `# PTU No.: ${ptu}`,
      ...(accredNo ? [`# Accreditation No.: ${accredNo}`] : []),
      ...(machSN   ? [`# Machine S/N: ${machSN}`]         : []),
      `# Period: ${month}`,
      `# Timezone: Asia/Manila (PST UTC+8)`,
      `# Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} PST`,
      `#`,
      headers.join(","),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="BIR-eSales-${month}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(csv);
  });

app.get("/api/bir/ejournal", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const { month } = req.query as Record<string, string>;
    if (!month || !/^\d{4}-\d{2}$/.test(month))
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });

    const [year, mon] = month.split("-").map(Number);
    const monStr = String(mon).padStart(2, "0");
    const lastDay = new Date(year, mon, 0).getDate();
    const lastDayStr = String(lastDay).padStart(2, "0");
    const startDate = new Date(`${year}-${monStr}-01T00:00:00+08:00`).toISOString();
    const endDate   = new Date(`${year}-${monStr}-${lastDayStr}T23:59:59.999+08:00`).toISOString();

const BIR_ROW_CAP = 25_000;
    const uid = getUserId(req);
    const [salesList, settingsData] = await Promise.all([
      storage.getSales(uid, { limit: BIR_ROW_CAP, startDate, endDate }),
      storage.getSettings(uid),
    ]);

    salesList.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

    const tin      = (settingsData as any)?.tin               || "";
    const storeName= (settingsData as any)?.storeName         || "STORE";
    const ptu      = (settingsData as any)?.ptuNumber         || "";
    const accredNo = (settingsData as any)?.accreditationNumber || "";
    const machSN   = (settingsData as any)?.machineSerialNumber || "";
    const currency = (settingsData as any)?.currency           || "PHP";

    const now        = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const periodLabel= new Date(`${year}-${monStr}-01`).toLocaleString("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" });

    const W   = 135;
    const SEP  = "=".repeat(W);
    const DASH = "-".repeat(W);

    function pad(s: string | number, len: number, right = false): string {
      const str = String(s);
      return right ? str.padStart(len) : str.padEnd(len);
    }
    function fmtDate(d: Date): string {
      return d.toLocaleDateString("en-PH", { month:"2-digit", day:"2-digit", year:"numeric", timeZone:"Asia/Manila" });
    }
    function fmtTime(d: Date): string {
      return d.toLocaleTimeString("en-PH", { hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false, timeZone:"Asia/Manila" });
    }
    function fmtDay(d: Date): string {
      return d.toLocaleDateString("en-PH", { weekday:"long", month:"long", day:"numeric", year:"numeric", timeZone:"Asia/Manila" }).toUpperCase();
    }
    function amt(n: number): string { return n.toFixed(2).padStart(12); }
    function amtHdr(s: string): string { return s.padStart(12); }

const CHAIN_SEED_INPUT = `EJOURNAL-GENESIS-${month}`;
    const chainSeed = createHash("sha256").update(CHAIN_SEED_INPUT).digest("hex");
    let prevHash = chainSeed;
    function chainStep(rowContent: string): string {
      const h = createHash("sha256").update(`${prevHash}|${rowContent}`).digest("hex");
      prevHash = h;
      return h.slice(0, 16);
    }

    const lines: string[] = [];

    lines.push(SEP);
    const titlePad = Math.max(0, Math.floor((W - 30) / 2));
    lines.push(" ".repeat(titlePad) + "ELECTRONIC JOURNAL (E-JOURNAL)");
    const namePad = Math.max(0, Math.floor((W - storeName.length) / 2));
    lines.push(" ".repeat(namePad) + storeName.toUpperCase());
    if (tin)    lines.push(`   TIN: ${pad(tin, 32)}${ptu ? `PTU No.: ${ptu}` : ""}`);
    if (machSN) lines.push(`   Machine S/N: ${pad(machSN, 26)}${accredNo ? `Accreditation No.: ${accredNo}` : ""}`);
    lines.push(`   Period: ${periodLabel.padEnd(32)}Timezone: Asia/Manila (PST UTC+8)`);
    lines.push(`   Generated: ${now} PST`);
    lines.push(`   Hash algorithm: SHA-256 chain  |  Seed: SHA-256("${CHAIN_SEED_INPUT}")`);
    lines.push(SEP);
    lines.push("");

    const COL_HDR =
      `${"EJ#".padEnd(7)}${"DATE".padEnd(12)}${"TIME".padEnd(10)}${"OR #".padEnd(14)}` +
      `${"PAYMENT".padEnd(12)}${"DISC TYPE".padEnd(12)}` +
      `${amtHdr("GROSS")}${amtHdr("DISC")}${amtHdr("TAX")}${amtHdr("NET")}` +
      `  [CHAIN-HASH    ]`;
    lines.push(COL_HDR);
    lines.push(DASH);

    let ejSeq = 0;
    let periodGross = 0, periodDisc = 0, periodTax = 0, periodNet = 0;
    let periodVatable = 0, periodExempt = 0, periodZero = 0;
    let orNumbers: string[] = [];

    const dayMap = new Map<string, typeof salesList>();
    for (const s of salesList) {
      const dayKey = new Date(s.createdAt!).toLocaleDateString("en-PH", { timeZone:"Asia/Manila", year:"numeric", month:"2-digit", day:"2-digit" });
      if (!dayMap.has(dayKey)) dayMap.set(dayKey, []);
      dayMap.get(dayKey)!.push(s);
    }

    for (const [, daySales] of dayMap) {
      const firstDate = new Date(daySales[0].createdAt!);
      lines.push(`-- ${fmtDay(firstDate)} --`);

      let dayGross = 0, dayDisc = 0, dayTax = 0, dayNet = 0;

      for (const s of daySales) {
        ejSeq++;
        const d    = new Date(s.createdAt!);
        const gross= parseFloat(s.total    || "0");
        const disc = parseFloat(s.discount || "0");
        const tax  = parseFloat(s.tax      || "0");
        const net  = gross - tax;
        const orNum= (s as any).orNumber || (s as any).receiptNumber || "";
        const pm   = (s.paymentMethod || "cash").toUpperCase().slice(0, 10);
        const dt   = ((s as any).discountType || "regular").toUpperCase().slice(0, 10);

        dayGross += gross; dayDisc += disc; dayTax += tax; dayNet += net;
        periodVatable += parseFloat((s as any).vatableSales   || "0");
        periodExempt  += parseFloat((s as any).vatExemptSales || "0");
        periodZero    += parseFloat((s as any).zeroRatedSales || "0");
        if (orNum) orNumbers.push(orNum);

        const rowData =
          `${pad(String(ejSeq).padStart(5, "0"), 7)}${fmtDate(d).padEnd(12)}${fmtTime(d).padEnd(10)}` +
          `${pad(orNum, 14)}${pad(pm, 12)}${pad(dt, 12)}` +
          `${amt(gross)}${amt(disc)}${amt(tax)}${amt(net)}`;

        lines.push(`${rowData}  [${chainStep(rowData)}]`);
      }

      periodGross += dayGross; periodDisc += dayDisc; periodTax += dayTax; periodNet += dayNet;
      lines.push(
        `${"DAILY TOTAL:".padEnd(43)}${pad(`${daySales.length} txn${daySales.length !== 1 ? "s" : ""}`, 8, true)}${amt(dayGross)}${amt(dayDisc)}${amt(dayTax)}${amt(dayNet)}`
      );
      lines.push(DASH);
    }

    if (salesList.length === 0) {
      lines.push("   No transactions recorded for this period.");
      lines.push(DASH);
    }

    lines.push("");
    lines.push(`PERIOD SUMMARY — ${periodLabel.toUpperCase()}`);
    lines.push(DASH);

    const orNums = orNumbers.filter(o => /^\d+$/.test(o)).map(Number).sort((a, b) => a - b);
    const orFrom = orNums.length ? String(orNums[0]).padStart(7, "0") : "(none)";
    const orTo   = orNums.length ? String(orNums[orNums.length - 1]).padStart(7, "0") : "(none)";

    const summaryRows: [string, string][] = [
      ["Total Transactions:", `${salesList.length}`],
      ["OR Range:",           `${orFrom} — ${orTo}`],
      ["Currency:",           currency],
      ["Gross Sales:",        periodGross.toFixed(2)],
      ["Total Discount:",     periodDisc.toFixed(2)],
      ["Output VAT:",         periodTax.toFixed(2)],
      ["VATable Sales:",      periodVatable.toFixed(2)],
      ["VAT-Exempt Sales:",   periodExempt.toFixed(2)],
      ["Zero-Rated Sales:",   periodZero.toFixed(2)],
      ["Net Sales:",          periodNet.toFixed(2)],
    ];
    for (const [label, value] of summaryRows) {
      lines.push(`   ${label.padEnd(26)}${value.padStart(16)}`);
    }

    lines.push("");
    lines.push(`CHAIN INTEGRITY`);
    lines.push(DASH);
    lines.push(`   Algorithm:       SHA-256 (each row: SHA-256(prevHash + "|" + rowContent))`);
    lines.push(`   Chain seed:      SHA-256("${CHAIN_SEED_INPUT}")`);
    lines.push(`                    = ${chainSeed}`);
    lines.push(`   Chained rows:    ${ejSeq} transaction row${ejSeq !== 1 ? "s" : ""}`);
    lines.push(`   Final hash:      ${prevHash}`);
    lines.push(`   Verification:    Recompute chain from seed; final hash must match exactly.`);
    lines.push(`                    Any mismatch proves the journal was altered after export.`);
    lines.push("");
    lines.push(SEP);
    lines.push("END OF ELECTRONIC JOURNAL");
    lines.push(SEP);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="EJournal-${month}.txt"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(lines.join("\n"));
  });

app.get("/api/bir/or-gaps", requireAuth, requirePro, async (req, res) => {
    const uid = getUserId(req);
    const orNumbers: number[] = await getBirOrNumbers(uid);
    if (orNumbers.length < 2) {
      return res.json({ gaps: [], totalChecked: orNumbers.length, gapCount: 0 });
    }

    const gaps: { from: number; to: number; count: number }[] = [];
    for (let i = 0; i < orNumbers.length - 1; i++) {
      const diff = orNumbers[i + 1] - orNumbers[i];
      if (diff > 1) {
        gaps.push({ from: orNumbers[i] + 1, to: orNumbers[i + 1] - 1, count: diff - 1 });
      }
    }

    res.json({
      gaps: gaps.slice(0, 50),
      totalChecked: orNumbers.length,
      gapCount: gaps.reduce((a, g) => a + g.count, 0),
      orMin: orNumbers[0],
      orMax: orNumbers[orNumbers.length - 1],
    });
  });

  app.get("/api/bir/void-trail", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const uid = getUserId(req);
    const rawRows = await getBirVoidTrailRows(uid);

    let tampered = 0, missingHash = 0;

    const entries = rawRows.map(r => {
      let hashStatus: "ok" | "tampered" | "missing" = "missing";
      if (r.sale_hash) {
        const payload = [
          r.user_id, r.receipt_number ?? "", r.or_number ?? "", r.invoice_number ?? "",
          r.subtotal ?? "0", r.tax ?? "0", r.discount ?? "0",
          r.vatable_sales ?? "0", r.vat_exempt_sales ?? "0", r.zero_rated_sales ?? "0",
          r.total, r.discount_type ?? "regular", r.created_at,
        ].join("|");
        const expected = createHash("sha256").update(payload).digest("hex");
        hashStatus = expected === r.sale_hash ? "ok" : "tampered";
      }
      if (hashStatus === "tampered") tampered++;
      if (hashStatus === "missing")  missingHash++;
      return {
        id: r.id,
        orNumber: r.or_number ?? null,
        receiptNumber: r.receipt_number ?? null,
        total: r.total,
        voidReason: r.void_reason ?? null,
        deletedAt: r.deleted_at,
        deletedByName: r.deleted_by_name ?? null,
        saleHash: r.sale_hash ?? null,
        hashStatus,
        createdAt: r.created_at,
      };
    });

    res.json({
      entries, totalVoided: entries.length, tampered, missingHash,
      verifiedAt: new Date().toISOString(),
    });
  });

  app.get("/api/bir/void-trail/export", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const uid = getUserId(req);
    const exportRows = await getBirVoidTrailExportRows(uid);

    const lines: string[] = [
      "Sale ID,OR Number,Receipt Number,Total,Void Reason,Voided At,Voided By,Sale Date,SHA-256 Hash,Hash Status",
    ];
    for (const r of exportRows) {
      let hashStatus = "NO_HASH";
      if (r.sale_hash) {
        const payload = [
          r.user_id, r.receipt_number ?? "", r.or_number ?? "", r.invoice_number ?? "",
          r.subtotal ?? "0", r.tax ?? "0", r.discount ?? "0",
          r.vatable_sales ?? "0", r.vat_exempt_sales ?? "0", r.zero_rated_sales ?? "0",
          r.total, r.discount_type ?? "regular", r.created_at,
        ].join("|");
        const expected = createHash("sha256").update(payload).digest("hex");
        hashStatus = expected === r.sale_hash ? "VERIFIED" : "TAMPERED";
      }
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      lines.push([
        r.id, esc(r.or_number ?? ""), esc(r.receipt_number ?? ""),
        r.total, esc(r.void_reason ?? ""), esc(r.deleted_at ?? ""),
        esc(r.deleted_by_name ?? ""), esc(r.created_at ?? ""),
        esc(r.sale_hash ?? ""), hashStatus,
      ].join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="BIR-VoidAuditLog.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(lines.join("\r\n"));
  });

app.get("/api/bir/hash-verify", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const uid = getUserId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const hashRows = await getBirHashVerifyRows(uid, { startDate, endDate });

    let passed = 0, failed = 0, missing = 0;
    const tamperedRows: { id: number; orNumber: string; createdAt: string }[] = [];

    for (const _r of hashRows) {
      const r = _r as Record<string, any>;
      if (!r.sale_hash) { missing++; continue; }
      const payload = [
        r.user_id, r.receipt_number ?? "", r.or_number ?? "", r.invoice_number ?? "",
        r.subtotal ?? "0", r.tax ?? "0", r.discount ?? "0",
        r.vatable_sales ?? "0", r.vat_exempt_sales ?? "0", r.zero_rated_sales ?? "0",
        r.total, r.discount_type ?? "regular", r.created_at,
      ].join("|");
      const expected = createHash("sha256").update(payload).digest("hex");
      if (expected === r.sale_hash) {
        passed++;
      } else {
        failed++;
        tamperedRows.push({ id: Number(r.id), orNumber: r.or_number ?? "", createdAt: r.created_at ?? "" });
      }
    }

    res.json({
      totalChecked: hashRows.length, passed, failed,
      missingHash: missing, integrityOk: failed === 0,
      tamperedRows: tamperedRows.slice(0, 100),
      checkedAt: new Date().toISOString(),
    });
  });

  app.get("/api/bir/refund-trail/export", requireAuth, requirePro, requireManagerOrAbove, async (req, res) => {
    const uid = getUserId(req);
    const refundRows = await getBirRefundTrailRows(uid);

    const headers = [
      "Refund ID", "Sale ID", "OR Number", "Receipt Number",
      "Refund Amount", "Original Total", "Reason", "Processed At", "Processed By"
    ];

    const csvRows = refundRows.map(_r => {
      const r = _r as Record<string, any>;
      return [
        `REF-${String(r.id).padStart(4, "0")}`,
        `TXN-${String(r.sale_id).padStart(4, "0")}`,
        r.or_number || "",
        r.receipt_number || "",
        parseFloat(r.amount || "0").toFixed(2),
        parseFloat(r.sale_total || "0").toFixed(2),
        r.reason || "",
        r.created_at ? new Date(String(r.created_at)).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "",
        r.processed_by_name || "",
      ];
    });

    const csv = [
      headers.join(","),
      ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="BIR-RefundAuditLog-${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(csv);
  });
}
