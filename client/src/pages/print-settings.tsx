import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, Printer, ReceiptText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { format } from "date-fns";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-1 pt-2 pb-1">
      {children}
    </p>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/20 last:border-0">
      <div className="shrink-0 pt-1">
        <p className="text-sm font-medium text-foreground leading-none">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div className="min-w-0 flex-1 max-w-[55%]">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange, "data-testid": testId }: { value: boolean; onChange: (v: boolean) => void; "data-testid"?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onChange(!value)}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0",
        value ? "bg-primary" : "bg-muted",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200",
          value ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

interface PrintConfig {
  receiptWidth: string;
  receiptTitle: string;
  receiptHeaderText: string;
  receiptWebsite: string;
  receiptShowAddress: boolean;
  receiptShowPhone: boolean;
  receiptShowEmail: boolean;
  receiptShowWebsite: boolean;
  receiptShowOrderNumber: boolean;
  receiptShowCashier: boolean;
  receiptShowUnitPrice: boolean;
  receiptShowPoweredBy: boolean;
  storeName: string;
  address: string;
  phone: string;
  emailContact: string;
  receiptFooter: string;
  currency: string;
}

function ReceiptPreview({ cfg }: { cfg: PrintConfig }) {
  const width = cfg.receiptWidth === "58mm" ? 210 : 280;
  const now = new Date();
  const sampleItems = [
    { name: "Caramel Macchiato", qty: 2, unitPrice: 150, size: "Large" },
    { name: "Blueberry Muffin", qty: 1, unitPrice: 75, size: "" },
  ];
  const subtotal = sampleItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const tax = Math.round(subtotal * 0.12);
  const total = subtotal + tax;

  return (
    <div
      className="bg-white text-black font-mono text-[11px] leading-relaxed mx-auto shadow-lg border border-gray-200 rounded-sm"
      style={{ width: `${width}px`, padding: "12px", fontFamily: "'Courier New', monospace" }}
    >
      <div className="text-center mb-2">
        {cfg.storeName && <p className="font-bold text-[13px]">{cfg.storeName}</p>}
        {cfg.receiptHeaderText && <p className="text-[10px]">{cfg.receiptHeaderText}</p>}
        {cfg.receiptTitle && <p className="text-[11px] font-semibold mt-0.5">{cfg.receiptTitle}</p>}
        <p className="text-[9px] text-gray-500 mt-0.5">{format(now, "MMM d, yyyy h:mm a")}</p>
        {cfg.receiptShowAddress && cfg.address && <p className="text-[9px] text-gray-500">{cfg.address}</p>}
        {cfg.receiptShowPhone && cfg.phone && <p className="text-[9px] text-gray-500">Tel: {cfg.phone}</p>}
        {cfg.receiptShowEmail && cfg.emailContact && <p className="text-[9px] text-gray-500">{cfg.emailContact}</p>}
        {cfg.receiptShowWebsite && cfg.receiptWebsite && <p className="text-[9px] text-gray-500">{cfg.receiptWebsite}</p>}
      </div>

      {cfg.receiptShowOrderNumber && (
        <div className="flex justify-between text-[9px] text-gray-400 mb-1">
          <span>Order #</span><span>1001</span>
        </div>
      )}
      {cfg.receiptShowCashier && (
        <div className="flex justify-between text-[9px] text-gray-400 mb-1">
          <span>Cashier</span><span>John Doe</span>
        </div>
      )}

      <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />

      {sampleItems.map((item, i) => (
        <div key={i} className="mb-1">
          <div className="flex justify-between">
            <span className="flex-1 mr-1 font-medium text-[11px]">
              {item.name}{item.size ? ` (${item.size})` : ""} x{item.qty}
            </span>
            <span className="tabular-nums text-[11px]">{formatCurrency(item.unitPrice * item.qty, cfg.currency || "₱")}</span>
          </div>
          {cfg.receiptShowUnitPrice && (
            <div className="text-[9px] text-gray-400 pl-2">
              {formatCurrency(item.unitPrice, cfg.currency || "₱")} × {item.qty}
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />

      <div className="flex justify-between text-[10px] text-gray-500"><span>Subtotal</span><span>{formatCurrency(subtotal, cfg.currency || "₱")}</span></div>
      <div className="flex justify-between text-[10px] text-gray-500"><span>Tax (12%)</span><span>{formatCurrency(tax, cfg.currency || "₱")}</span></div>
      <div style={{ borderTop: "1px dashed #999", margin: "4px 0" }} />
      <div className="flex justify-between font-bold text-[13px]"><span>TOTAL</span><span>{formatCurrency(total, cfg.currency || "₱")}</span></div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-0.5"><span>Payment (CASH)</span><span>{formatCurrency(400, cfg.currency || "₱")}</span></div>
      <div className="flex justify-between text-[10px] text-emerald-600 font-semibold"><span>Change</span><span>{formatCurrency(400 - total, cfg.currency || "₱")}</span></div>

      {cfg.receiptFooter && (
        <>
          <div style={{ borderTop: "1px dashed #999", margin: "6px 0" }} />
          <p className="text-center text-[9px] text-gray-500">{cfg.receiptFooter}</p>
        </>
      )}
      <p className="text-center text-[10px] text-gray-400 mt-1">Thank you!</p>
      {cfg.receiptShowPoweredBy && (
        <p className="text-center text-[8px] text-gray-300 mt-0.5">Powered by ArtixPOS</p>
      )}
    </div>
  );
}

export default function PrintSettings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const { user } = useAuth();

  const isOwner = user?.role === "owner";

  const [cfg, setCfg] = useState<PrintConfig>({
    receiptWidth: "80mm",
    receiptTitle: "OFFICIAL RECEIPT",
    receiptHeaderText: "",
    receiptWebsite: "",
    receiptShowAddress: true,
    receiptShowPhone: true,
    receiptShowEmail: false,
    receiptShowWebsite: false,
    receiptShowOrderNumber: true,
    receiptShowCashier: false,
    receiptShowUnitPrice: false,
    receiptShowPoweredBy: true,
    storeName: "",
    address: "",
    phone: "",
    emailContact: "",
    receiptFooter: "",
    currency: "₱",
  });

  useEffect(() => {
    if (!settings) return;
    const s = settings as any;
    setCfg({
      receiptWidth: s.receiptWidth ?? "80mm",
      receiptTitle: s.receiptTitle ?? "OFFICIAL RECEIPT",
      receiptHeaderText: s.receiptHeaderText ?? "",
      receiptWebsite: s.receiptWebsite ?? "",
      receiptShowAddress: (s.receiptShowAddress ?? 1) === 1,
      receiptShowPhone: (s.receiptShowPhone ?? 1) === 1,
      receiptShowEmail: (s.receiptShowEmail ?? 0) === 1,
      receiptShowWebsite: (s.receiptShowWebsite ?? 0) === 1,
      receiptShowOrderNumber: (s.receiptShowOrderNumber ?? 1) === 1,
      receiptShowCashier: (s.receiptShowCashier ?? 0) === 1,
      receiptShowUnitPrice: (s.receiptShowUnitPrice ?? 0) === 1,
      receiptShowPoweredBy: (s.receiptShowPoweredBy ?? 1) === 1,
      storeName: s.storeName ?? "",
      address: s.address ?? "",
      phone: s.phone ?? "",
      emailContact: s.emailContact ?? "",
      receiptFooter: s.receiptFooter ?? "",
      currency: s.currency ?? "₱",
    });
  }, [settings]);

  const set = <K extends keyof PrintConfig>(key: K, val: PrintConfig[K]) =>
    setCfg(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      receiptWidth: cfg.receiptWidth,
      receiptTitle: cfg.receiptTitle,
      receiptHeaderText: cfg.receiptHeaderText || null,
      receiptWebsite: cfg.receiptWebsite || null,
      receiptShowAddress: cfg.receiptShowAddress ? 1 : 0,
      receiptShowPhone: cfg.receiptShowPhone ? 1 : 0,
      receiptShowEmail: cfg.receiptShowEmail ? 1 : 0,
      receiptShowWebsite: cfg.receiptShowWebsite ? 1 : 0,
      receiptShowOrderNumber: cfg.receiptShowOrderNumber ? 1 : 0,
      receiptShowCashier: cfg.receiptShowCashier ? 1 : 0,
      receiptShowUnitPrice: cfg.receiptShowUnitPrice ? 1 : 0,
      receiptShowPoweredBy: cfg.receiptShowPoweredBy ? 1 : 0,
    } as any);
    toast({ title: "Print settings saved" });
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="max-w-lg">
        <div className="bg-card rounded-2xl border border-border/25 px-6 py-10 text-center">
          <Printer className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">Owner access required</p>
          <p className="text-sm text-muted-foreground mt-1">Only the store owner can manage print settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl page-enter">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ReceiptText className="h-4.5 w-4.5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none">Print Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Customize how your receipts look when printed.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Settings Form */}
        <div className="flex-1 space-y-1 min-w-0">

          <SectionLabel>Paper & Layout</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
            <SettingRow label="Paper Width" hint="Match your thermal printer roll size">
              <div className="flex gap-2 justify-end">
                {(["58mm", "80mm"] as const).map(w => (
                  <button
                    key={w}
                    type="button"
                    data-testid={`button-width-${w}`}
                    onClick={() => set("receiptWidth", w)}
                    className={[
                      "px-3 py-1 rounded-lg text-sm font-medium border transition-colors",
                      cfg.receiptWidth === w
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-transparent hover:border-border",
                    ].join(" ")}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow label="Receipt Title" hint='e.g. "OFFICIAL RECEIPT" or "SALES INVOICE"'>
              <Input
                value={cfg.receiptTitle}
                onChange={e => set("receiptTitle", e.target.value)}
                className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                placeholder="OFFICIAL RECEIPT"
                data-testid="input-receipt-title"
              />
            </SettingRow>

            <SettingRow label="Header Tagline" hint="Appears below store name">
              <Input
                value={cfg.receiptHeaderText}
                onChange={e => set("receiptHeaderText", e.target.value)}
                className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                placeholder="e.g. VAT Reg. TIN 000-000-000"
                data-testid="input-receipt-header-text"
              />
            </SettingRow>
          </div>

          <SectionLabel>Store Info on Receipt</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
            <SettingRow label="Show Address">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowAddress} onChange={v => set("receiptShowAddress", v)} data-testid="toggle-show-address" />
              </div>
            </SettingRow>
            <SettingRow label="Show Phone">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowPhone} onChange={v => set("receiptShowPhone", v)} data-testid="toggle-show-phone" />
              </div>
            </SettingRow>
            <SettingRow label="Show Email">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowEmail} onChange={v => set("receiptShowEmail", v)} data-testid="toggle-show-email" />
              </div>
            </SettingRow>
            <SettingRow label="Website URL" hint="Your store website or social link">
              <Input
                value={cfg.receiptWebsite}
                onChange={e => set("receiptWebsite", e.target.value)}
                className="h-8 text-sm rounded-lg bg-secondary/60 border-none text-right pr-3"
                placeholder="www.yourstore.com"
                data-testid="input-receipt-website"
              />
            </SettingRow>
            <SettingRow label="Show Website">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowWebsite} onChange={v => set("receiptShowWebsite", v)} data-testid="toggle-show-website" />
              </div>
            </SettingRow>
          </div>

          <SectionLabel>Transaction Details</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
            <SettingRow label="Show Order Number" hint="Print the transaction ID on the receipt">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowOrderNumber} onChange={v => set("receiptShowOrderNumber", v)} data-testid="toggle-show-order-number" />
              </div>
            </SettingRow>
            <SettingRow label="Show Cashier Name" hint="Print the name of the staff who made the sale">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowCashier} onChange={v => set("receiptShowCashier", v)} data-testid="toggle-show-cashier" />
              </div>
            </SettingRow>
            <SettingRow label="Show Unit Price" hint="Show per-item price alongside qty × total">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowUnitPrice} onChange={v => set("receiptShowUnitPrice", v)} data-testid="toggle-show-unit-price" />
              </div>
            </SettingRow>
          </div>

          <SectionLabel>Branding</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 px-4 shadow-sm">
            <SettingRow label="Show 'Powered by ArtixPOS'" hint="Attribution footer on printed receipts">
              <div className="flex justify-end">
                <Toggle value={cfg.receiptShowPoweredBy} onChange={v => set("receiptShowPoweredBy", v)} data-testid="toggle-show-powered-by" />
              </div>
            </SettingRow>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="w-full h-10 rounded-xl font-semibold mt-3 bg-primary text-white shadow-md shadow-primary/20 hover:opacity-90 transition-all"
            data-testid="button-save-print-settings"
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {updateSettings.isPending ? "Saving..." : "Save Print Settings"}
          </Button>
        </div>

        {/* Live Preview */}
        <div className="lg:w-[320px] shrink-0">
          <SectionLabel>Live Preview</SectionLabel>
          <div className="bg-card rounded-2xl border border-border/25 p-4 shadow-sm sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <Printer className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {cfg.receiptWidth} Preview
              </span>
            </div>
            <div className="overflow-x-auto">
              <ReceiptPreview cfg={cfg} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
