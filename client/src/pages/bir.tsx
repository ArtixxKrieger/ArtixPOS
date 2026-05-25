import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NATIVE_TOKEN_KEY } from "@/lib/queryClient";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, addYears, differenceInDays, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  CheckCircle2, XCircle, AlertTriangle, FileText, Download,
  Printer, Receipt, CreditCard, Banknote, Smartphone,
  Hash, BarChart3, Tag, ShieldCheck, ExternalLink,
  RefreshCw, Clock, TrendingUp, Users, Archive, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Shift } from "@shared/schema";
import { PhantomLoader } from "@/components/ui/phantom-loader";

interface XReportData {
  shift: any | null;
  orFrom: string | null;
  orTo: string | null;
  totalTransactions: number;
  grossSales: number;
  netSales: number;
  totalDiscount: number;
  totalLoyaltyDiscount: number;
  vatableSalesTotal: number;
  vatExemptTotal: number;
  zeroRatedTotal: number;
  vatAmountTotal: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
  discountBreakdown: Record<string, { count: number; total: number; discount: number }>;
}

interface ZReportData {
  shift: Shift;
  orFrom: string | null;
  orTo: string | null;
  totalTransactions: number;
  grossSales: number;
  netSales: number;
  totalDiscount: number;
  totalLoyaltyDiscount: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
  discountBreakdown: Record<string, { count: number; total: number; discount: number }>;
  vatableSalesTotal: number;
  vatExemptTotal: number;
  zeroRatedTotal: number;
  vatAmountTotal: number;
  topItems: { name: string; qty: number; total: number }[];
}

interface MonthlySummary {
  month: string;
  orFrom: string | null;
  orTo: string | null;
  totalTransactions: number;
  grossSales: number;
  netSales: number;
  outputVat: number;
  vatableSales: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  totalDiscount: number;
  scPwdCount: number;
  scPwdDiscount: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash", card: "Card", gcash: "GCash", maya: "Maya",
  paymaya: "PayMaya", ewallet: "E-Wallet", credit: "Credit Card", debit: "Debit Card",
};
const DISCOUNT_LABEL: Record<string, string> = {
  regular: "Regular", sc: "Senior Citizen (SC)", pwd: "PWD",
};

function PaymentIcon({ method }: { method: string }) {
  const m = method.toLowerCase();
  if (m === "card" || m === "credit" || m === "debit") return <CreditCard className="h-3.5 w-3.5" />;
  if (m === "gcash" || m === "maya" || m === "paymaya" || m === "ewallet") return <Smartphone className="h-3.5 w-3.5" />;
  return <Banknote className="h-3.5 w-3.5" />;
}

function SectionTitle({ icon: Icon, label, sub }: { icon: any; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-sm">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function StatusRow({ ok, warn, label, value, hint }: { ok?: boolean; warn?: boolean; label: string; value?: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0">
      <div className="shrink-0">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : warn ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-medium", ok ? "text-foreground" : warn ? "text-amber-700 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      {value && (
        <p className="text-xs font-bold tabular-nums text-muted-foreground truncate max-w-[120px]" title={value}>{value}</p>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color = "" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-secondary/40 rounded-xl p-3 flex flex-col gap-0.5">
      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-sm font-bold tabular-nums", color)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function BIRPage() {
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const currency = (settings as any)?.currency || "₱";

  const tin = (settings as any)?.tin || "";
  const ptuNumber = (settings as any)?.ptuNumber || "";
  const accreditationNumber = (settings as any)?.accreditationNumber || "";
  const accreditationDate = (settings as any)?.accreditationDate || "";
  const machineSerialNumber = (settings as any)?.machineSerialNumber || "";
  const vatRegistered = !!(settings as any)?.vatRegistered;
  const storeName = (settings as any)?.storeName || "Store";
  const taxRate = parseNumeric((settings as any)?.taxRate || 0);

  const [selectedMonth, setSelectedMonth] = useState(() => format(startOfMonth(new Date()), "yyyy-MM"));
  const [zReportShiftId, setZReportShiftId] = useState<number | null>(null);
  const [orGapExpanded, setOrGapExpanded] = useState(false);
  const [show2550M, setShow2550M] = useState(false);
  const [inputTax, setInputTax] = useState("0");

  const { data: shifts = [] } = useQuery<Shift[]>({ queryKey: ["/api/shifts"] });
  const closedShifts = useMemo(() => (shifts as Shift[]).filter((s: Shift) => s.status === "closed").slice(0, 10), [shifts]);

  const { data: zReport, isLoading: zReportLoading } = useQuery<ZReportData>({
    queryKey: ["/api/shifts", zReportShiftId, "z-report"],
    enabled: !!zReportShiftId,
    queryFn: () => fetch(`/api/shifts/${zReportShiftId}/z-report`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(NATIVE_TOKEN_KEY) || ""}` },
      credentials: "include",
    }).then(r => r.json()),
  });

  const { data: orGapData, isLoading: orGapLoading, refetch: refetchOrGaps } = useQuery<{
    gaps: { from: number; to: number; count: number }[];
    totalChecked: number;
    gapCount: number;
    orMin?: number;
    orMax?: number;
  }>({
    queryKey: ["/api/bir/or-gaps"],
    enabled: orGapExpanded,
    staleTime: 5 * 60 * 1000,
  });

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 13; i++) {
      const d = subMonths(new Date(), i);
      opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") });
    }
    return opts;
  }, []);

  // Accreditation expiry
  const accreditationExpiry = useMemo(() => {
    if (!accreditationDate) return null;
    try {
      const issued = new Date(accreditationDate);
      const expiry = addYears(issued, 5);
      const daysLeft = differenceInDays(expiry, new Date());
      return { expiry, daysLeft };
    } catch { return null; }
  }, [accreditationDate]);

  const { data: xReport, isLoading: xLoading, refetch: refetchX } = useQuery<XReportData>({
    queryKey: ["/api/bir/x-report"],
    refetchInterval: 60000,
  });

  const { data: monthlySummary, isLoading: monthlyLoading } = useQuery<MonthlySummary>({
    queryKey: ["/api/bir/summary", selectedMonth],
    queryFn: () => fetch(`/api/bir/summary?month=${selectedMonth}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem(NATIVE_TOKEN_KEY) || ""}` },
      credentials: "include",
    }).then(r => r.json()),
  });

  const complianceScore = [!!tin, !!ptuNumber, !!accreditationNumber, !!machineSerialNumber, vatRegistered].filter(Boolean).length;
  const complianceTotal = 5;

  function downloadEjournal() {
    const token = localStorage.getItem(NATIVE_TOKEN_KEY) || "";
    const url = `/api/bir/ejournal?month=${selectedMonth}`;
    fetch(url, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (!r.ok) throw new Error("Download failed");
        return r.blob();
      })
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `EJournal-${selectedMonth}.txt`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(objUrl);
        document.body.removeChild(a);
        toast({ title: `E-Journal downloaded for ${selectedMonth}` });
      })
      .catch(() => toast({ title: "Download failed", variant: "destructive" }));
  }

  function downloadEsales() {
    const token = localStorage.getItem(NATIVE_TOKEN_KEY) || "";
    const url = `/api/bir/esales-export?month=${selectedMonth}`;
    const a = document.createElement("a");
    a.href = url;
    if (token) a.href = url + `&_token=${encodeURIComponent(token)}`;
    a.download = `BIR-eSales-${selectedMonth}.csv`;
    document.body.appendChild(a);
    fetch(url, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.click();
        URL.revokeObjectURL(objUrl);
        document.body.removeChild(a);
        toast({ title: `eSales CSV downloaded for ${selectedMonth}` });
      })
      .catch(() => toast({ title: "Download failed", variant: "destructive" }));
  }

  function printXReport(d: XReportData) {
    if (!d.shift) return;
    const sh = d.shift;
    const now = new Date();
    const dateStr = format(now, "MMMM d, yyyy");
    const timeStr = format(now, "hh:mm a");
    const openTime = sh.openedAt ? format(new Date(sh.openedAt), "hh:mm a") : "--";
    const pmRows = Object.entries(d.paymentBreakdown || {})
      .map(([pm, v]) => `<div class="row"><span>${PAYMENT_LABEL[pm] || pm} (${v.count})</span><span>${currency}${v.total.toFixed(2)}</span></div>`).join("");
    const discountRows = Object.entries(d.discountBreakdown || {})
      .filter(([, v]) => v.count > 0)
      .map(([dt, v]) => `<div class="row"><span>${DISCOUNT_LABEL[dt] || dt} (${v.count})</span><span>-${currency}${v.discount.toFixed(2)}</span></div>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>X-Report ${dateStr}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 11px; width: 300px; margin: 0 auto; padding: 20px 16px; color: #000; }
      .center { text-align: center; } .bold { font-weight: bold; }
      .line { border-top: 1px dashed #000; margin: 6px 0; } .double { border-top: 3px double #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; padding: 0 2px; }
      .title { font-size: 15px; font-weight: bold; margin: 4px 0 2px; }
      .small { font-size: 9px; } .section { margin: 4px 0; font-size: 9px; font-weight: bold; letter-spacing: 0.08em; text-align: center; }
      .highlight { background: #f5f5f5; padding: 3px 4px; margin: 2px 0; }
      @media print { body { padding: 8px; } }
    </style></head><body>
    <div class="center">
      <div class="title">${storeName}</div>
      ${tin ? `<div class="small">TIN: ${tin}</div>` : ""}
      ${ptuNumber ? `<div class="small">PTU No.: ${ptuNumber}</div>` : ""}
      ${accreditationNumber ? `<div class="small">Accreditation No.: ${accreditationNumber}</div>` : ""}
      ${machineSerialNumber ? `<div class="small">Machine S/N: ${machineSerialNumber}</div>` : ""}
    </div>
    <div class="double"></div>
    <div class="center bold" style="font-size:13px">X - R E P O R T</div>
    <div class="center small">Reading Report — Shift NOT closed</div>
    <div class="center small">Printed: ${dateStr} at ${timeStr}</div>
    <div class="center small">Shift opened: ${openTime}</div>
    <div class="line"></div>
    ${d.orFrom ? `<div class="row highlight bold"><span>OR Range</span><span>${d.orFrom} — ${d.orTo}</span></div>` : ""}
    <div class="row"><span>Transactions so far</span><span>${d.totalTransactions}</span></div>
    <div class="line"></div>
    <div class="section">— CURRENT SALES —</div>
    <div class="row bold"><span>Gross Sales (incl. VAT)</span><span>${currency}${d.grossSales.toFixed(2)}</span></div>
    <div class="row"><span>Discounts</span><span>-${currency}${d.totalDiscount.toFixed(2)}</span></div>
    <div class="row"><span>Output VAT</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row bold"><span>Net Sales (excl. VAT)</span><span>${currency}${d.netSales.toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="section">— PAYMENT BREAKDOWN —</div>
    ${pmRows || '<div class="center small">No transactions yet</div>'}
    <div class="line"></div>
    <div class="section">— DISCOUNT BREAKDOWN —</div>
    ${discountRows || '<div class="center small">No discounts applied</div>'}
    <div class="line"></div>
    <div class="section">— BIR VAT (RUNNING) —</div>
    <div class="row"><span>VATable Sales</span><span>${currency}${d.vatableSalesTotal.toFixed(2)}</span></div>
    <div class="row"><span>Output VAT (${taxRate}%)</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row"><span>VAT-Exempt Sales</span><span>${currency}${d.vatExemptTotal.toFixed(2)}</span></div>
    <div class="row"><span>Zero-Rated Sales</span><span>${currency}${d.zeroRatedTotal.toFixed(2)}</span></div>
    <div class="double"></div>
    <div class="center small">*** X-REPORT — NOT END OF DAY ***</div>
    <div class="center small">Shift is still open. Do NOT close drawer.</div>
    </body></html>`;
    const win = window.open("", "_blank", "width=420,height=680");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
  }

  function printZReport(d: ZReportData) {
    const sh = d.shift;
    const dateStr = format(new Date(sh.openedAt!), "MMMM d, yyyy");
    const openTime = format(new Date(sh.openedAt!), "hh:mm a");
    const closeTime = sh.closedAt ? format(new Date(sh.closedAt), "hh:mm a") : "--";
    const pmRows = Object.entries(d.paymentBreakdown || {})
      .map(([pm, v]) => `<div class="row"><span>${PAYMENT_LABEL[pm] || pm.toUpperCase()} (${v.count})</span><span>${currency}${v.total.toFixed(2)}</span></div>`).join("");
    const discountRowsZ = Object.entries(d.discountBreakdown || {})
      .filter(([, v]) => v.count > 0)
      .map(([dt, v]) => `<div class="row"><span>${DISCOUNT_LABEL[dt] || dt} (${v.count})</span><span>-${currency}${v.discount.toFixed(2)}</span></div>`).join("");
    const topItemRows = (d.topItems || []).slice(0, 5)
      .map((it, i) => `<div class="row"><span>${i + 1}. ${it.name}</span><span>x${it.qty}</span></div>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Z-Report — ${dateStr}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 11px; width: 300px; margin: 0 auto; padding: 20px 16px; color: #000; }
      .center { text-align: center; } .bold { font-weight: bold; }
      .line { border-top: 1px dashed #000; margin: 6px 0; } .double { border-top: 3px double #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 2px 0; padding: 0 2px; }
      .title { font-size: 15px; font-weight: bold; margin: 4px 0 2px; } .small { font-size: 9px; }
      .section { margin: 4px 0; font-size: 9px; font-weight: bold; letter-spacing: 0.08em; text-align: center; }
      .highlight { background: #f5f5f5; padding: 3px 4px; margin: 2px 0; }
      @media print { body { padding: 8px; } }
    </style></head><body>
    <div class="center">
      <div class="title">${storeName}</div>
      ${tin ? `<div class="small">TIN: ${tin}</div>` : ""}
      ${ptuNumber ? `<div class="small">PTU No.: ${ptuNumber}</div>` : ""}
      ${accreditationNumber ? `<div class="small">Accreditation No.: ${accreditationNumber}</div>` : ""}
      ${machineSerialNumber ? `<div class="small">Machine S/N: ${machineSerialNumber}</div>` : ""}
    </div>
    <div class="double"></div>
    <div class="center bold" style="font-size:13px">Z - R E P O R T</div>
    <div class="center small">${dateStr} &nbsp;|&nbsp; ${openTime} &mdash; ${closeTime}</div>
    <div class="line"></div>
    ${d.orFrom ? `<div class="row highlight bold"><span>OR Number Range</span><span>${d.orFrom} &mdash; ${d.orTo}</span></div>` : ""}
    <div class="row"><span>Total Transactions</span><span>${d.totalTransactions}</span></div>
    <div class="line"></div>
    <div class="section">— SALES SUMMARY —</div>
    <div class="row bold"><span>Gross Sales (incl. VAT)</span><span>${currency}${d.grossSales.toFixed(2)}</span></div>
    <div class="row"><span>Total Discount</span><span>-${currency}${d.totalDiscount.toFixed(2)}</span></div>
    <div class="row"><span>Output VAT (${taxRate}%)</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row bold"><span>Net Sales (excl. VAT)</span><span>${currency}${d.netSales.toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="section">— PAYMENT BREAKDOWN —</div>
    ${pmRows || '<div class="center small">No transactions</div>'}
    <div class="line"></div>
    <div class="section">— DISCOUNT BREAKDOWN —</div>
    ${discountRowsZ || '<div class="center small">No discounts</div>'}
    <div class="line"></div>
    <div class="section">— BIR VAT BREAKDOWN —</div>
    <div class="row"><span>VATable Sales</span><span>${currency}${d.vatableSalesTotal.toFixed(2)}</span></div>
    <div class="row"><span>Output VAT (${taxRate}%)</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row"><span>VAT-Exempt Sales</span><span>${currency}${d.vatExemptTotal.toFixed(2)}</span></div>
    <div class="row"><span>Zero-Rated Sales</span><span>${currency}${d.zeroRatedTotal.toFixed(2)}</span></div>
    ${topItemRows ? `<div class="line"></div><div class="section">— TOP ITEMS —</div>${topItemRows}` : ""}
    <div class="double"></div>
    <div class="center small">*** END OF Z-REPORT ***</div>
    <div class="center small">Printed: ${format(new Date(), "MMM d, yyyy h:mm a")}</div>
    </body></html>`;
    const win = window.open("", "_blank", "width=420,height=700");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
  }

  function printVatSummary() {
    if (!monthlySummary) return;
    const d = monthlySummary;
    const monthLabel = format(new Date(d.month + "-01"), "MMMM yyyy");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>VAT Summary ${d.month}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Courier New', monospace; font-size: 11px; width: 340px; margin: 0 auto; padding: 20px 16px; color: #000; }
      .center { text-align: center; } .bold { font-weight: bold; }
      .line { border-top: 1px dashed #000; margin: 6px 0; } .double { border-top: 3px double #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; margin: 3px 0; padding: 0 2px; }
      .title { font-size: 14px; font-weight: bold; margin: 4px 0 2px; } .small { font-size: 9px; }
      .section { margin: 4px 0; font-size: 9px; font-weight: bold; letter-spacing: 0.08em; text-align: center; }
      .box { border: 1px solid #000; padding: 4px 6px; margin: 3px 0; }
      @media print { body { padding: 8px; } }
    </style></head><body>
    <div class="center">
      <div class="title">${storeName}</div>
      ${tin ? `<div class="small">TIN: ${tin}</div>` : ""}
      ${ptuNumber ? `<div class="small">PTU No.: ${ptuNumber}</div>` : ""}
      ${accreditationNumber ? `<div class="small">Accreditation No.: ${accreditationNumber}</div>` : ""}
      ${machineSerialNumber ? `<div class="small">Machine S/N: ${machineSerialNumber}</div>` : ""}
    </div>
    <div class="double"></div>
    <div class="center bold" style="font-size:12px">MONTHLY VAT SUMMARY</div>
    <div class="center small">For BIR Form 2550M Reference</div>
    <div class="center small">Period: ${monthLabel}</div>
    <div class="line"></div>
    ${d.orFrom ? `<div class="row bold"><span>OR Range</span><span>${d.orFrom} — ${d.orTo}</span></div>` : ""}
    <div class="row"><span>Total Transactions</span><span>${d.totalTransactions}</span></div>
    <div class="line"></div>
    <div class="section">— OUTPUT TAX (SALES) —</div>
    <div class="row bold"><span>Gross Sales (incl. VAT)</span><span>${currency}${d.grossSales.toFixed(2)}</span></div>
    <div class="row"><span>VATable Sales</span><span>${currency}${d.vatableSales.toFixed(2)}</span></div>
    <div class="row bold"><span>Output VAT (${taxRate}%)</span><span>${currency}${d.outputVat.toFixed(2)}</span></div>
    <div class="row"><span>VAT-Exempt Sales</span><span>${currency}${d.vatExemptSales.toFixed(2)}</span></div>
    <div class="row"><span>Zero-Rated Sales</span><span>${currency}${d.zeroRatedSales.toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="section">— DISCOUNTS —</div>
    <div class="row"><span>Total Discount</span><span>${currency}${d.totalDiscount.toFixed(2)}</span></div>
    <div class="row"><span>SC/PWD Discounts (${d.scPwdCount} txn)</span><span>${currency}${d.scPwdDiscount.toFixed(2)}</span></div>
    <div class="double"></div>
    <div class="center small">This is a system-generated summary only.</div>
    <div class="center small">Consult your accountant for official filings.</div>
    <div class="center small">Printed: ${format(new Date(), "MMM d, yyyy h:mm a")}</div>
    </body></html>`;
    const win = window.open("", "_blank", "width=440,height=700");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 400); }
  }

  function print2550M(inputTaxAmt: number) {
    if (!monthlySummary) return;
    const d = monthlySummary;
    const monthLabel = format(new Date(d.month + "-01"), "MMMM yyyy");
    const [yr, mo] = d.month.split("-");
    const dueDateRaw = new Date(parseInt(yr), parseInt(mo) - 1 + 1, 20);
    const dueDate = format(dueDateRaw, "MMMM d, yyyy");
    const vatPayable = Math.max(0, d.outputVat - inputTaxAmt);
    const excessInput = Math.max(0, inputTaxAmt - d.outputVat);

    const row = (line: string, desc: string, val: string | number, bold = false, shade = false) => {
      const formatted = typeof val === "number" ? `${currency}${val.toFixed(2)}` : val;
      return `<tr style="${shade ? "background:#f9f9f9;" : ""}${bold ? "font-weight:bold;" : ""}">
        <td style="padding:4px 8px;border-bottom:1px solid #eee;width:44px;color:#555;font-size:10px;">${line}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;font-size:11px;">${desc}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;font-family:'Courier New',monospace;font-size:11px;white-space:nowrap;">${formatted}</td>
      </tr>`;
    };
    const sectionRow = (title: string) =>
      `<tr><td colspan="3" style="padding:8px 8px 4px;background:#f0f0f0;font-size:9px;font-weight:bold;letter-spacing:0.08em;color:#444;border-bottom:1px solid #ddd;">${title}</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>BIR Form 2550M Worksheet — ${d.month}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #000; background: #fff; margin: 0; padding: 24px; }
      h1 { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
      h2 { font-size: 12px; font-weight: normal; color: #444; margin-bottom: 16px; }
      .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; margin-bottom: 16px; border: 1px solid #ccc; border-radius: 6px; padding: 12px; background: #fafafa; }
      .header-field { margin-bottom: 8px; }
      .header-field label { font-size: 9px; color: #888; font-weight: bold; letter-spacing: 0.06em; text-transform: uppercase; display: block; margin-bottom: 2px; }
      .header-field span { font-size: 12px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; border: 1px solid #ccc; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
      .disclaimer { font-size: 9px; color: #666; margin-top: 12px; border-top: 1px dashed #ccc; padding-top: 10px; }
      .payable-box { border: 2px solid #000; border-radius: 6px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
      .payable-box .label { font-size: 13px; font-weight: bold; }
      .payable-box .amount { font-size: 20px; font-weight: bold; font-family: 'Courier New', monospace; }
      .excess-box { border: 1px solid #999; border-radius: 6px; padding: 10px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; background: #f9f9f9; }
      @media print { body { padding: 16px; } }
    </style></head><body>
    <div style="text-align:center;margin-bottom:16px;">
      <p style="font-size:9px;color:#666;font-weight:bold;letter-spacing:0.1em;">REPUBLIC OF THE PHILIPPINES — BUREAU OF INTERNAL REVENUE</p>
      <h1>BIR FORM 2550M — MONTHLY VAT RETURN</h1>
      <h2>Pre-Filled Worksheet for ${monthLabel}</h2>
      <p style="font-size:9px;color:#888;">This is a system-generated reference worksheet, not an official BIR form. Consult your accountant before filing.</p>
    </div>

    <div class="header-grid">
      <div class="header-field"><label>Taxpayer Registered Name</label><span>${storeName}</span></div>
      <div class="header-field"><label>TIN</label><span>${tin || "NOT SET — update in BIR Settings"}</span></div>
      <div class="header-field"><label>Return Period</label><span>${monthLabel}</span></div>
      <div class="header-field"><label>Filing Due Date</label><span>${dueDate} (20th of following month)</span></div>
      ${ptuNumber ? `<div class="header-field"><label>Permit to Use (PTU) No.</label><span>${ptuNumber}</span></div>` : ""}
      ${accreditationNumber ? `<div class="header-field"><label>Accreditation No.</label><span>${accreditationNumber}</span></div>` : ""}
      ${machineSerialNumber ? `<div class="header-field"><label>Machine Serial No.</label><span>${machineSerialNumber}</span></div>` : ""}
      <div class="header-field"><label>OR Number Range</label><span>${d.orFrom ? `${d.orFrom} — ${d.orTo}` : "N/A"}</span></div>
      <div class="header-field"><label>Total Transactions</label><span>${d.totalTransactions}</span></div>
    </div>

    <table>
      ${sectionRow("PART I — OUTPUT TAX (SALES / RECEIPTS)")}
      ${row("10", "Total Sales/Receipts (Gross, including VAT)", d.grossSales, true, true)}
      ${row("11", "Sales to Government (BIR mandated 5% withholding)", 0)}
      ${row("12", "Zero-Rated Sales (export / special economic zone)", d.zeroRatedSales)}
      ${row("13", "Net VATable Sales / Receipts", d.vatableSales, true, true)}
      ${row("13A", `Output Tax Due on Line 13 (${taxRate}%)`, d.outputVat, true, true)}
      ${row("14", "VAT-Exempt Sales / Receipts", d.vatExemptSales)}
      ${row("15", "Total Sales (Line 10 = vatable + exempt + zero-rated)", d.grossSales, false, true)}
      ${sectionRow("DISCOUNTS & ADJUSTMENTS")}
      ${row("", "Total Discounts Given", d.totalDiscount)}
      ${row("", `SC/PWD Discounts (${d.scPwdCount} transaction${d.scPwdCount !== 1 ? "s" : ""})`, d.scPwdDiscount, false, true)}
      ${sectionRow("PART II — INPUT TAX (PURCHASES — enter your actual figures)")}
      ${row("16", "Input Tax from Domestic Purchases of Goods", "(enter on official form)")}
      ${row("17", "Input Tax from Domestic Purchases of Services", "(enter on official form)")}
      ${row("18", "Input Tax from Importation of Goods", "(enter on official form)")}
      ${row("23", "Other Input Tax (prior period excess, etc.)", "(enter on official form)")}
      ${row("24", "Total Allowable Input Tax (entered by user)", `${currency}${inputTaxAmt.toFixed(2)}`, true, true)}
      ${sectionRow("PART III — COMPUTATION OF VAT PAYABLE")}
      ${row("13A", "Output Tax", d.outputVat, false, true)}
      ${row("24", "Less: Allowable Input Tax", inputTaxAmt, false, true)}
    </table>

    ${vatPayable > 0 ? `
    <div class="payable-box">
      <div class="label">Line 25 — VAT PAYABLE (Due by ${dueDate})</div>
      <div class="amount">${currency}${vatPayable.toFixed(2)}</div>
    </div>` : ""}

    ${excessInput > 0 ? `
    <div class="excess-box">
      <div class="label">Excess Input Tax (carry forward to next period)</div>
      <div style="font-size:16px;font-weight:bold;font-family:'Courier New',monospace;">${currency}${excessInput.toFixed(2)}</div>
    </div>` : ""}

    <div class="disclaimer">
      <p><strong>IMPORTANT:</strong> This worksheet is pre-filled from your POS sales data for reference only. You must file the official BIR Form 2550M through your BIR eFPS/eBIRForms account or authorized tax software.</p>
      <p style="margin-top:4px;">Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")} | ArtixPOS BIR Compliance Center</p>
      <p style="margin-top:4px;">Filing deadline: <strong>${dueDate}</strong> | Consult your accountant to verify input tax credits before filing.</p>
    </div>
    </body></html>`;
    const win = window.open("", "_blank", "width=860,height=960");
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
  }

  return (
    <div className="space-y-5 page-enter pb-8">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">BIR Compliance Center</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Philippine Bureau of Internal Revenue — All compliance tools in one place</p>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border shrink-0",
          complianceScore === complianceTotal
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
            : complianceScore >= 3
              ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400"
        )}>
          <ShieldCheck className="h-3.5 w-3.5" />
          {complianceScore}/{complianceTotal} Ready
        </div>
      </div>

      {/* ── Compliance Status ──────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <SectionTitle icon={ShieldCheck} label="Registration Status" sub="Required BIR fields for receipts and reports" />

        {accreditationExpiry && accreditationExpiry.daysLeft <= 90 && (
          <div className={cn(
            "flex items-start gap-2 p-3 rounded-xl mb-3 border",
            accreditationExpiry.daysLeft <= 0
              ? "bg-rose-500/8 border-rose-500/20"
              : "bg-amber-500/8 border-amber-500/20"
          )}>
            <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", accreditationExpiry.daysLeft <= 0 ? "text-rose-500" : "text-amber-500")} />
            <div>
              <p className={cn("text-xs font-bold", accreditationExpiry.daysLeft <= 0 ? "text-rose-600 dark:text-rose-400" : "text-amber-700 dark:text-amber-400")}>
                {accreditationExpiry.daysLeft <= 0
                  ? "BIR Accreditation EXPIRED"
                  : `Accreditation expiring in ${accreditationExpiry.daysLeft} days`}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Expires: {format(accreditationExpiry.expiry, "MMMM d, yyyy")} — Renew with your BIR RDO immediately
              </p>
            </div>
          </div>
        )}

        <div className="bg-secondary/30 rounded-xl px-3">
          <StatusRow ok={!!tin} label="VAT Registration TIN" value={tin || undefined} hint={!tin ? "Required on all official receipts" : undefined} />
          <StatusRow ok={!!ptuNumber} label="Permit to Use (PTU) No." value={ptuNumber || undefined} hint={!ptuNumber ? "BIR authorization to use this POS machine" : undefined} />
          <StatusRow ok={!!accreditationNumber} label="Accreditation No."
            value={accreditationNumber || undefined}
            warn={!!(accreditationExpiry && accreditationExpiry.daysLeft > 0 && accreditationExpiry.daysLeft <= 90)}
            hint={!accreditationNumber ? "BIR accreditation certificate number" : accreditationExpiry && accreditationExpiry.daysLeft <= 90 ? `Expires ${format(accreditationExpiry.expiry, "MMM d, yyyy")}` : undefined}
          />
          <StatusRow ok={!!machineSerialNumber} label="Machine Serial No." value={machineSerialNumber || undefined} hint={!machineSerialNumber ? "POS machine hardware serial number" : undefined} />
          <StatusRow ok={vatRegistered} label="VAT Registered" hint={!vatRegistered ? "Enable to show BIR VAT breakdown on receipts" : "VAT breakdown appears on all receipts"} />
        </div>

        <div className="mt-3">
          <Link href="/print-settings">
            <Button variant="outline" size="sm" className="rounded-xl text-xs gap-1.5" data-testid="button-go-bir-settings">
              <ExternalLink className="h-3 w-3" /> Update BIR Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* ── CAS Registration Info ──────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <SectionTitle icon={FileText} label="CAS Registration" sub="Computerized Accounting System — one-time BIR filing" />
        <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Action Required — Complete Offline with BIR</p>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p>• File <strong>BIR Form 1900</strong> (Application for Authority to Use Computerized Accounting System) with your RDO</p>
            <p>• Submit printout of this system's receipt format and Z-Report samples</p>
            <p>• Obtain your <strong>Permit to Use (PTU)</strong> — enter it above once approved</p>
            <p>• BIR may conduct an on-site inspection before issuing PTU</p>
          </div>
        </div>
      </div>

      {/* ── X-Report (Live Shift Reading) ─────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={Clock} label="X-Report (Live Reading)" sub="Real-time view of current shift — does not close the shift" />
          <button
            onClick={() => refetchX()}
            className="h-7 w-7 rounded-lg bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {xLoading && (
          <PhantomLoader count={3} countGap={8}>
            <div className="h-10 rounded-xl border border-border bg-card flex items-center gap-3 px-4">
              <div className="flex-1 text-sm font-medium">Loading X-Report…</div>
            </div>
          </PhantomLoader>
        )}

        {!xLoading && (!xReport || !xReport.shift) && (
          <div className="text-center py-6 text-muted-foreground/60">
            <Clock className="h-8 w-8 mx-auto mb-2" strokeWidth={1.2} />
            <p className="text-sm font-medium">No active shift</p>
            <p className="text-xs mt-1">Open a shift in the Shifts page to see real-time data</p>
            <Link href="/shifts">
              <Button variant="outline" size="sm" className="mt-3 rounded-xl text-xs gap-1.5">
                <ExternalLink className="h-3 w-3" /> Go to Shifts
              </Button>
            </Link>
          </div>
        )}

        {!xLoading && xReport?.shift && (
          <>
            <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2 mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Shift active since {xReport.shift.openedAt ? format(new Date(xReport.shift.openedAt), "h:mm a") : "--"}
              </p>
              {xReport.orFrom && (
                <p className="text-[10px] text-muted-foreground ml-auto">
                  OR: {xReport.orFrom} → {xReport.orTo}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <StatCard label="Transactions" value={String(xReport.totalTransactions)} color="text-primary" />
              <StatCard label="Gross Sales" value={formatCurrency(xReport.grossSales, currency)} color="text-emerald-600 dark:text-emerald-400" />
              <StatCard label="Output VAT" value={formatCurrency(xReport.vatAmountTotal, currency)} color="text-primary" />
              <StatCard label="Discounts" value={formatCurrency(xReport.totalDiscount, currency)} color="text-rose-500" />
            </div>

            {/* Payment breakdown */}
            {Object.keys(xReport.paymentBreakdown || {}).length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Methods</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(xReport.paymentBreakdown || {}).map(([pm, v]) => (
                    <div key={pm} className="bg-secondary/30 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <PaymentIcon method={pm} />
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold">{PAYMENT_LABEL[pm] || pm}</p>
                        <p className="text-[9px] text-muted-foreground">{v.count} txn · {formatCurrency(v.total, currency)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Discount breakdown */}
            {Object.keys(xReport.discountBreakdown || {}).some(k => (xReport.discountBreakdown || {})[k]?.count > 0) && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Discount Breakdown</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(xReport.discountBreakdown || {}).filter(([, v]) => v.count > 0).map(([dt, v]) => (
                    <div key={dt} className="bg-secondary/30 rounded-lg px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold">{DISCOUNT_LABEL[dt] || dt}</p>
                      <p className="text-[9px] text-muted-foreground">{v.count} txn · -{formatCurrency(v.discount, currency)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VAT breakdown */}
            <div className="bg-secondary/30 rounded-xl px-3 py-2 mb-3">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">BIR VAT Breakdown (Running)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { label: "VATable Sales", value: xReport.vatableSalesTotal },
                  { label: `Output VAT (${taxRate}%)`, value: xReport.vatAmountTotal, primary: true },
                  { label: "VAT-Exempt Sales", value: xReport.vatExemptTotal },
                  { label: "Zero-Rated Sales", value: xReport.zeroRatedTotal },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <p className={cn("text-[10px]", row.primary ? "font-semibold text-primary" : "text-muted-foreground")}>{row.label}</p>
                    <p className={cn("text-[10px] font-bold tabular-nums", row.primary ? "text-primary" : "")}>{formatCurrency(row.value, currency)}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              className="rounded-xl text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold"
              onClick={() => printXReport(xReport)}
              data-testid="button-print-x-report"
            >
              <Printer className="h-3.5 w-3.5" /> Print X-Report
            </Button>
          </>
        )}
      </div>

      {/* ── Monthly Reports ───────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionTitle icon={BarChart3} label="Monthly VAT Report" sub="For BIR Form 2550M/Q filing reference" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="h-8 rounded-xl bg-secondary/60 border border-border/40 text-xs font-medium px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40 shrink-0"
            data-testid="select-bir-month"
          >
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {monthlyLoading && (
          <PhantomLoader count={3} countGap={8}>
            <div className="h-12 rounded-xl border border-border bg-card flex items-center gap-3 px-4">
              <div className="flex-1 text-sm font-medium">Loading monthly summary…</div>
            </div>
          </PhantomLoader>
        )}

        {!monthlyLoading && monthlySummary && (
          <>
            {/* OR Range */}
            {monthlySummary.orFrom && (
              <div className="bg-primary/8 border border-primary/20 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold">OR Range for {format(new Date(monthlySummary.month + "-01"), "MMMM yyyy")}</p>
                </div>
                <p className="text-xs font-bold tabular-nums text-primary">
                  {monthlySummary.orFrom} → {monthlySummary.orTo}
                </p>
              </div>
            )}

            {/* Summary grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              <StatCard label="Transactions" value={String(monthlySummary.totalTransactions)} color="text-primary" />
              <StatCard label="Gross Sales" value={formatCurrency(monthlySummary.grossSales, currency)} color="text-emerald-600 dark:text-emerald-400" />
              <StatCard label="Output VAT" value={formatCurrency(monthlySummary.outputVat, currency)} color="text-primary" />
              <StatCard label="VATable Sales" value={formatCurrency(monthlySummary.vatableSales, currency)} />
              <StatCard label="VAT-Exempt" value={formatCurrency(monthlySummary.vatExemptSales, currency)} />
              <StatCard label="Zero-Rated" value={formatCurrency(monthlySummary.zeroRatedSales, currency)} />
            </div>

            {/* Discount summary */}
            <div className="bg-secondary/30 rounded-xl px-3 py-2 mb-3">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Discount Summary</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">Total Discounts</p>
                  <p className="text-[10px] text-muted-foreground">All discount types</p>
                </div>
                <p className="text-sm font-bold tabular-nums text-rose-500">{formatCurrency(monthlySummary.totalDiscount, currency)}</p>
              </div>
              {monthlySummary.scPwdCount > 0 && (
                <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/30">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 text-amber-500" />
                    <div>
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">SC/PWD Discounts</p>
                      <p className="text-[10px] text-muted-foreground">{monthlySummary.scPwdCount} transaction{monthlySummary.scPwdCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatCurrency(monthlySummary.scPwdDiscount, currency)}</p>
                </div>
              )}
            </div>

            {/* Payment breakdown */}
            {Object.keys(monthlySummary.paymentBreakdown || {}).length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Method Breakdown</p>
                <div className="space-y-1.5">
                  {Object.entries(monthlySummary.paymentBreakdown || {})
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([pm, v]) => {
                      const pct = monthlySummary.grossSales > 0 ? (v.total / monthlySummary.grossSales) * 100 : 0;
                      return (
                        <div key={pm} className="bg-secondary/30 rounded-lg px-3 py-2">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <PaymentIcon method={pm} />
                              <span className="text-xs font-medium">{PAYMENT_LABEL[pm] || pm.toUpperCase()}</span>
                              <span className="text-[10px] text-muted-foreground">({v.count} txns)</span>
                            </div>
                            <span className="text-xs font-bold tabular-nums">{formatCurrency(v.total, currency)}</span>
                          </div>
                          <div className="h-1 bg-secondary rounded-full overflow-hidden">
                            <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct.toFixed(1)}%` }} />
                          </div>
                          <p className="text-[9px] text-muted-foreground mt-0.5 text-right">{pct.toFixed(1)}% of gross</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs gap-1.5 h-10"
                onClick={printVatSummary}
                data-testid="button-print-vat-summary"
              >
                <Printer className="h-3.5 w-3.5" /> Print VAT Summary
              </Button>
              <Button
                size="sm"
                className="rounded-xl text-xs gap-1.5 h-10 font-bold"
                onClick={downloadEsales}
                data-testid="button-download-esales"
              >
                <Download className="h-3.5 w-3.5" /> Download eSales CSV
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full rounded-xl text-xs gap-1.5 h-10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/8 font-semibold mt-1"
              onClick={downloadEjournal}
              data-testid="button-download-ejournal"
            >
              <Archive className="h-3.5 w-3.5" /> Download E-Journal (.txt)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full rounded-xl text-xs gap-1.5 h-10 border-primary/30 text-primary hover:bg-primary/8 font-semibold mt-1"
              onClick={() => { setInputTax("0"); setShow2550M(true); }}
              data-testid="button-open-2550m"
            >
              <BookOpen className="h-3.5 w-3.5" /> Pre-fill BIR Form 2550M
            </Button>
          </>
        )}

        {!monthlyLoading && monthlySummary && monthlySummary.totalTransactions === 0 && (
          <div className="text-center py-4 text-muted-foreground/60 mt-2">
            <Receipt className="h-7 w-7 mx-auto mb-1.5" strokeWidth={1.2} />
            <p className="text-xs">No sales recorded for {format(new Date(selectedMonth + "-01"), "MMMM yyyy")}</p>
          </div>
        )}
      </div>

      {/* ── Z-Report Archive ──────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <SectionTitle icon={Archive} label="Z-Report Archive" sub="BIR-required end-of-shift reports — keep on file for 10 years" />
        {closedShifts.length === 0 ? (
          <div className="text-center py-5 text-muted-foreground/60">
            <Archive className="h-7 w-7 mx-auto mb-2" strokeWidth={1.2} />
            <p className="text-xs">No closed shifts yet — Z-Reports are generated when you close a shift</p>
            <Link href="/shifts">
              <Button variant="outline" size="sm" className="mt-3 rounded-xl text-xs gap-1.5">
                <ExternalLink className="h-3 w-3" /> Go to Shifts
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {closedShifts.map(shift => (
              <div key={shift.id} className="flex items-center justify-between gap-3 bg-secondary/30 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    {shift.openedAt ? format(new Date(shift.openedAt), "MMMM d, yyyy") : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {shift.openedAt ? format(new Date(shift.openedAt), "h:mm a") : ""}
                    {shift.closedAt ? ` — ${format(new Date(shift.closedAt), "h:mm a")}` : ""}
                    {" · "}
                    {formatCurrency(shift.totalSales ?? "0", currency)} sales
                  </p>
                </div>
                <button
                  onClick={() => setZReportShiftId(shift.id)}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 transition-colors shrink-0"
                  data-testid={`button-bir-z-report-${shift.id}`}
                >
                  <FileText className="h-3 w-3" /> Z-Report
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Z-Report modal */}
        {zReportShiftId && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-4 sm:pb-0" onClick={() => setZReportShiftId(null)}>
            <div className="bg-background rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border/30 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
                <div>
                  <p className="font-bold text-sm">Z-Report</p>
                  {zReport?.shift?.openedAt && (
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(zReport.shift.openedAt), "MMM d, yyyy")}
                      {" · "}
                      {format(new Date(zReport.shift.openedAt), "h:mm a")}
                      {zReport.shift.closedAt && ` — ${format(new Date(zReport.shift.closedAt), "h:mm a")}`}
                    </p>
                  )}
                </div>
                <button onClick={() => setZReportShiftId(null)} className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {zReportLoading && (
                  <PhantomLoader count={3} countGap={8}>
                    <div className="h-12 rounded-xl border border-border bg-card flex items-center gap-3 px-4">
                      <div className="flex-1 text-sm font-medium">Loading Z-Report…</div>
                    </div>
                  </PhantomLoader>
                )}
                {!zReportLoading && zReport && !(zReport as any).shift && (
                  <div className="text-center py-6 text-muted-foreground/60">
                    <AlertTriangle className="h-7 w-7 mx-auto mb-2 text-amber-500" />
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Could not load Z-Report</p>
                    <p className="text-xs mt-1">{(zReport as any).message || "Please try again"}</p>
                  </div>
                )}
                {!zReportLoading && zReport?.shift && (
                  <>
                    {zReport.orFrom && (
                      <div className="bg-primary/8 border border-primary/20 rounded-xl px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5 text-primary" />
                          <p className="text-xs font-semibold">OR Range</p>
                        </div>
                        <p className="text-xs font-bold tabular-nums text-primary">{zReport.orFrom} → {zReport.orTo}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Transactions" value={String(zReport.totalTransactions)} color="text-primary" />
                      <StatCard label="Gross Sales" value={formatCurrency(zReport.grossSales, currency)} color="text-emerald-600 dark:text-emerald-400" />
                      <StatCard label="Total Discount" value={formatCurrency(zReport.totalDiscount, currency)} color="text-rose-500" />
                      <StatCard label="Output VAT" value={formatCurrency(zReport.vatAmountTotal, currency)} color="text-primary" />
                    </div>
                    <div className="bg-secondary/30 rounded-xl px-3 py-2">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">BIR VAT Breakdown</p>
                      {[
                        { label: "VATable Sales", value: zReport.vatableSalesTotal },
                        { label: `Output VAT (${taxRate}%)`, value: zReport.vatAmountTotal, primary: true },
                        { label: "VAT-Exempt Sales", value: zReport.vatExemptTotal },
                        { label: "Zero-Rated Sales", value: zReport.zeroRatedTotal },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between py-0.5">
                          <p className={cn("text-[10px]", row.primary ? "font-semibold text-primary" : "text-muted-foreground")}>{row.label}</p>
                          <p className={cn("text-[10px] font-bold tabular-nums", row.primary ? "text-primary" : "")}>{formatCurrency(row.value, currency)}</p>
                        </div>
                      ))}
                    </div>
                    {Object.keys(zReport.paymentBreakdown || {}).length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Methods</p>
                        <div className="space-y-1">
                          {Object.entries(zReport.paymentBreakdown || {}).map(([pm, v]) => (
                            <div key={pm} className="bg-secondary/30 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <PaymentIcon method={pm} />
                                <span className="text-[10px] font-medium">{PAYMENT_LABEL[pm] || pm}</span>
                                <span className="text-[9px] text-muted-foreground">({v.count})</span>
                              </div>
                              <span className="text-[10px] font-bold tabular-nums">{formatCurrency(v.total, currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {Object.entries(zReport.discountBreakdown || {}).filter(([,v]) => v.count > 0).length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Discount Breakdown</p>
                        <div className="space-y-1">
                          {Object.entries(zReport.discountBreakdown || {}).filter(([,v]) => v.count > 0).map(([dt, v]) => (
                            <div key={dt} className="bg-secondary/30 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-medium">{DISCOUNT_LABEL[dt] || dt}</span>
                                <span className="text-[9px] text-muted-foreground ml-1">({v.count} txn)</span>
                              </div>
                              <span className="text-[10px] font-bold tabular-nums text-rose-500">-{formatCurrency(v.discount, currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      className="w-full rounded-xl text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold"
                      onClick={() => printZReport(zReport)}
                      data-testid="button-print-bir-z-report"
                    >
                      <Printer className="h-3.5 w-3.5" /> Print Z-Report
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── OR Number Gap Detection ───────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <button
          className="w-full flex items-center justify-between"
          onClick={() => setOrGapExpanded(v => !v)}
          data-testid="button-or-gap-toggle"
        >
          <SectionTitle
            icon={Hash}
            label="OR Number Gap Detection"
            sub="BIR audit tool — detects missing OR numbers in your sequence"
          />
          <div className="flex items-center gap-2 shrink-0">
            {orGapData && orGapData.gapCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                {orGapData.gapCount} gap{orGapData.gapCount !== 1 ? "s" : ""}
              </span>
            )}
            {orGapData && orGapData.gapCount === 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                No gaps
              </span>
            )}
            <div className={cn("h-4 w-4 text-muted-foreground transition-transform", orGapExpanded ? "rotate-180" : "")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M6 9l6 6 6-6"/></svg>
            </div>
          </div>
        </button>

        {orGapExpanded && (
          <div className="mt-3 space-y-3">
            {orGapLoading && (
              <PhantomLoader count={2} countGap={8}>
                <div className="h-10 rounded-xl border border-border bg-card flex items-center gap-3 px-4">
                  <div className="flex-1 text-sm font-medium">Loading OR gap data…</div>
                </div>
              </PhantomLoader>
            )}
            {!orGapLoading && orGapData && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-secondary/40 rounded-xl px-3 py-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Checked</p>
                    <p className="text-sm font-bold tabular-nums">{orGapData.totalChecked}</p>
                  </div>
                  <div className="bg-secondary/40 rounded-xl px-3 py-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Range</p>
                    <p className="text-[10px] font-bold tabular-nums">
                      {orGapData.orMin != null ? `${orGapData.orMin}–${orGapData.orMax}` : "—"}
                    </p>
                  </div>
                  <div className={cn("rounded-xl px-3 py-2 text-center", orGapData.gapCount > 0 ? "bg-rose-500/10 border border-rose-500/20" : "bg-emerald-500/10 border border-emerald-500/20")}>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Gaps</p>
                    <p className={cn("text-sm font-bold tabular-nums", orGapData.gapCount > 0 ? "text-rose-500" : "text-emerald-500")}>{orGapData.gapCount}</p>
                  </div>
                </div>

                {orGapData.totalChecked < 2 && (
                  <div className="text-center py-3 text-muted-foreground/60">
                    <Hash className="h-6 w-6 mx-auto mb-1.5" strokeWidth={1.2} />
                    <p className="text-xs">Not enough numeric OR numbers on record to detect gaps</p>
                    <p className="text-[10px] mt-0.5">Only numeric OR numbers (e.g. 00001) can be gap-checked</p>
                  </div>
                )}

                {orGapData.totalChecked >= 2 && orGapData.gapCount === 0 && (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">OR sequence is complete</p>
                      <p className="text-[10px] text-muted-foreground">No missing OR numbers detected — your records are BIR-audit ready</p>
                    </div>
                  </div>
                )}

                {orGapData.gaps.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Missing OR Numbers</p>
                      <p className="text-[9px] text-muted-foreground ml-auto">BIR may flag these during audit</p>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {orGapData.gaps.map((g, i) => (
                        <div key={i} className="flex items-center justify-between bg-rose-500/8 border border-rose-500/15 rounded-lg px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3 w-3 text-rose-500" />
                            <span className="text-[10px] font-semibold tabular-nums">
                              {g.from === g.to ? `OR #${g.from}` : `OR #${g.from} – #${g.to}`}
                            </span>
                          </div>
                          <span className="text-[9px] text-rose-600 dark:text-rose-400 font-medium">
                            {g.count} missing
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-2">
                      Tip: Voided transactions should still appear in your records with a VOID remark. Missing ORs may indicate unrecorded transactions.
                    </p>
                  </div>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl text-xs gap-1.5"
                  onClick={() => refetchOrGaps()}
                  data-testid="button-or-gap-refresh"
                >
                  <RefreshCw className="h-3 w-3" /> Re-scan OR Numbers
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── What's Next (BIR Filing Checklist) ───────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <SectionTitle icon={TrendingUp} label="BIR Filing Checklist" sub="Steps for monthly and quarterly VAT compliance" />
        <div className="space-y-2">
          {[
            { label: "File VAT Return (BIR Form 2550M)", hint: "Due: 20th of following month — use Output VAT figures above", done: false },
            { label: "Submit Quarterly VAT Return (2550Q)", hint: "Due: 25th of month following the quarter", done: false },
            { label: "Register CAS with BIR (Form 1900)", hint: "One-time registration — required to legally use this POS system", done: !!ptuNumber },
            { label: "Renew Accreditation (every 5 years)", hint: accreditationExpiry ? `Current expiry: ${format(accreditationExpiry.expiry, "MMM d, yyyy")}` : "Set your accreditation date in BIR Settings", done: !!(accreditationExpiry && accreditationExpiry.daysLeft > 90) },
            { label: "Keep printed Z-Reports on file", hint: "BIR requires 10 years of Z-Report records", done: false },
          ].map((item, i) => (
            <div key={i} className={cn(
              "flex items-start gap-2.5 px-3 py-2.5 rounded-xl border",
              item.done ? "bg-emerald-500/5 border-emerald-500/15" : "bg-secondary/30 border-border/30"
            )}>
              {item.done
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0 mt-0.5" />}
              <div>
                <p className={cn("text-xs font-semibold", item.done ? "text-emerald-700 dark:text-emerald-400" : "")}>{item.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{item.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2550M Pre-Fill Modal ───────────────────────────────────── */}
      {show2550M && monthlySummary && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm px-4 pb-4 sm:pb-0"
          onClick={() => setShow2550M(false)}
        >
          <div
            className="bg-background rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-background/95 backdrop-blur border-b border-border/30 px-5 py-4 flex items-center justify-between rounded-t-3xl z-10">
              <div>
                <p className="font-bold text-sm">BIR Form 2550M — Pre-Fill Worksheet</p>
                <p className="text-[11px] text-muted-foreground">
                  {format(new Date(monthlySummary.month + "-01"), "MMMM yyyy")} · {monthlySummary.totalTransactions} transactions
                </p>
              </div>
              <button
                onClick={() => setShow2550M(false)}
                className="h-8 w-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  This is a reference worksheet only — not an official BIR filing. Use eFPS or eBIRForms to submit. Consult your accountant before filing.
                </p>
              </div>

              {/* Taxpayer info */}
              <div className="bg-secondary/30 rounded-xl px-3 py-2.5 space-y-1.5">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Taxpayer Information</p>
                {[
                  { label: "Registered Name", value: storeName },
                  { label: "TIN", value: tin || "⚠ Not set — update in BIR Settings" },
                  { label: "Return Period", value: format(new Date(monthlySummary.month + "-01"), "MMMM yyyy") },
                  { label: "Filing Due", value: (() => { const [yr, mo] = monthlySummary.month.split("-"); return format(new Date(parseInt(yr), parseInt(mo) - 1 + 1, 20), "MMMM d, yyyy"); })() },
                  ...(ptuNumber ? [{ label: "PTU No.", value: ptuNumber }] : []),
                  ...(accreditationNumber ? [{ label: "Accreditation No.", value: accreditationNumber }] : []),
                  ...(machineSerialNumber ? [{ label: "Machine S/N", value: machineSerialNumber }] : []),
                ].map(r => (
                  <div key={r.label} className="flex items-start justify-between gap-3">
                    <p className="text-[10px] text-muted-foreground shrink-0">{r.label}</p>
                    <p className="text-[10px] font-semibold text-right">{r.value}</p>
                  </div>
                ))}
              </div>

              {/* Output Tax */}
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Part I — Output Tax (Sales)</p>
                <div className="space-y-1">
                  {[
                    { line: "10", label: "Total Sales / Receipts (incl. VAT)", value: monthlySummary.grossSales, bold: true },
                    { line: "11", label: "Sales to Government (5% withholding)", value: 0 },
                    { line: "12", label: "Zero-Rated Sales", value: monthlySummary.zeroRatedSales },
                    { line: "13", label: "Net VATable Sales / Receipts", value: monthlySummary.vatableSales, bold: true, shade: true },
                    { line: "13A", label: `Output Tax Due (${taxRate}% of Line 13)`, value: monthlySummary.outputVat, bold: true, primary: true },
                    { line: "14", label: "VAT-Exempt Sales / Receipts", value: monthlySummary.vatExemptSales },
                  ].map(r => (
                    <div key={r.line} className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg",
                      r.primary ? "bg-primary/8 border border-primary/20" : r.shade ? "bg-secondary/50" : "bg-secondary/20"
                    )}>
                      <span className="text-[9px] text-muted-foreground font-mono w-7 shrink-0">{r.line}</span>
                      <span className={cn("text-[10px] flex-1", r.bold ? "font-semibold" : "")}>{r.label}</span>
                      <span className={cn("text-[10px] font-bold tabular-nums", r.primary ? "text-primary" : "")}>{formatCurrency(r.value, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SC/PWD Discounts */}
              {monthlySummary.scPwdCount > 0 && (
                <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2">
                  <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">SC/PWD Discounts (Adjustments)</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-amber-700 dark:text-amber-400">
                      {monthlySummary.scPwdCount} transaction{monthlySummary.scPwdCount !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{formatCurrency(monthlySummary.scPwdDiscount, currency)}</p>
                  </div>
                </div>
              )}

              {/* Input Tax entry */}
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Part II — Input Tax (Your Purchases)</p>
                <div className="bg-secondary/30 rounded-xl px-3 py-3 space-y-2">
                  <p className="text-[10px] text-muted-foreground">Enter your total allowable input tax from purchase invoices, importation, and prior period credits. Your accountant can help verify this figure.</p>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-semibold shrink-0 w-28">Line 24 — Total Input Tax</label>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currency}</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={inputTax}
                        onChange={e => setInputTax(e.target.value)}
                        className="pl-6 h-8 text-xs rounded-lg"
                        placeholder="0.00"
                        data-testid="input-2550m-input-tax"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Live computation */}
              {(() => {
                const itAmt = Math.max(0, parseFloat(inputTax) || 0);
                const vatPayable = Math.max(0, monthlySummary.outputVat - itAmt);
                const excessInput = Math.max(0, itAmt - monthlySummary.outputVat);
                return (
                  <div>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Part III — VAT Payable</p>
                    <div className="space-y-1 mb-2">
                      {[
                        { line: "13A", label: "Output Tax Due", value: monthlySummary.outputVat },
                        { line: "24",  label: "Less: Allowable Input Tax", value: itAmt },
                      ].map(r => (
                        <div key={r.line} className="flex items-center gap-2 px-2.5 py-1.5 bg-secondary/20 rounded-lg">
                          <span className="text-[9px] text-muted-foreground font-mono w-7 shrink-0">{r.line}</span>
                          <span className="text-[10px] flex-1">{r.label}</span>
                          <span className="text-[10px] font-bold tabular-nums">{formatCurrency(r.value, currency)}</span>
                        </div>
                      ))}
                    </div>
                    {vatPayable > 0 && (
                      <div className="bg-rose-500/8 border-2 border-rose-500/30 rounded-xl px-3 py-3 flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs font-bold text-rose-600 dark:text-rose-400">Line 25 — VAT PAYABLE</p>
                          <p className="text-[9px] text-muted-foreground">
                            Due by {(() => { const [yr, mo] = monthlySummary.month.split("-"); return format(new Date(parseInt(yr), parseInt(mo) - 1 + 1, 20), "MMM d, yyyy"); })()}
                          </p>
                        </div>
                        <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(vatPayable, currency)}</p>
                      </div>
                    )}
                    {excessInput > 0 && (
                      <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-3 flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Excess Input Tax</p>
                          <p className="text-[9px] text-muted-foreground">Carry forward to next period</p>
                        </div>
                        <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(excessInput, currency)}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <Button
                className="w-full rounded-xl text-xs gap-1.5 font-bold bg-primary h-10"
                onClick={() => print2550M(Math.max(0, parseFloat(inputTax) || 0))}
                data-testid="button-print-2550m"
              >
                <Printer className="h-3.5 w-3.5" /> Print 2550M Worksheet (A4)
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
