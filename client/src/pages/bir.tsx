import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency, parseNumeric } from "@/lib/format";
import { format, addYears, differenceInDays, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  CheckCircle2, XCircle, AlertTriangle, FileText, Download,
  Printer, Receipt, CreditCard, Banknote, Smartphone,
  Hash, BarChart3, Tag, ShieldCheck, ExternalLink,
  RefreshCw, Clock, TrendingUp, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  const monthOptions = useMemo(() => {
    const opts = [];
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
      headers: { Authorization: `Bearer ${localStorage.getItem("artixpos_token") || ""}` },
      credentials: "include",
    }).then(r => r.json()),
  });

  const complianceScore = [!!tin, !!ptuNumber, !!accreditationNumber, !!machineSerialNumber, vatRegistered].filter(Boolean).length;
  const complianceTotal = 5;

  function downloadEsales() {
    const token = localStorage.getItem("artixpos_token") || "";
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
    const pmRows = Object.entries(d.paymentBreakdown)
      .map(([pm, v]) => `<div class="row"><span>${PAYMENT_LABEL[pm] || pm} (${v.count})</span><span>${currency}${v.total.toFixed(2)}</span></div>`).join("");
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
    <div class="row bold"><span>Gross Sales</span><span>${currency}${d.grossSales.toFixed(2)}</span></div>
    <div class="row"><span>Discounts</span><span>-${currency}${d.totalDiscount.toFixed(2)}</span></div>
    <div class="row"><span>Output VAT</span><span>${currency}${d.vatAmountTotal.toFixed(2)}</span></div>
    <div class="row bold"><span>Net Sales</span><span>${currency}${d.netSales.toFixed(2)}</span></div>
    <div class="line"></div>
    <div class="section">— PAYMENT BREAKDOWN —</div>
    ${pmRows || '<div class="center small">No transactions yet</div>'}
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
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton-shimmer rounded-xl" />)}
          </div>
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
            {Object.keys(xReport.paymentBreakdown).length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Methods</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {Object.entries(xReport.paymentBreakdown).map(([pm, v]) => (
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
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 skeleton-shimmer rounded-xl" />)}
          </div>
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
            {Object.keys(monthlySummary.paymentBreakdown).length > 0 && (
              <div className="mb-3">
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment Method Breakdown</p>
                <div className="space-y-1.5">
                  {Object.entries(monthlySummary.paymentBreakdown)
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
          </>
        )}

        {!monthlyLoading && monthlySummary && monthlySummary.totalTransactions === 0 && (
          <div className="text-center py-4 text-muted-foreground/60 mt-2">
            <Receipt className="h-7 w-7 mx-auto mb-1.5" strokeWidth={1.2} />
            <p className="text-xs">No sales recorded for {format(new Date(selectedMonth + "-01"), "MMMM yyyy")}</p>
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

    </div>
  );
}
