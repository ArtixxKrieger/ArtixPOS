import { useEffect, useState, useRef } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Save, Printer, ReceiptText, Bluetooth, Usb, Zap, RefreshCw, CheckCircle2, XCircle, Circle } from "lucide-react";
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

// ESC/POS test print bytes
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
function buildTestPrintData(storeName: string): Uint8Array {
  const enc = new TextEncoder();
  const header = enc.encode(storeName || "ArtixPOS");
  const line = enc.encode("Test Print - OK");
  const date = enc.encode(new Date().toLocaleString());
  return new Uint8Array([
    ESC, 0x40,        // Initialize
    ESC, 0x61, 0x01, // Center
    ...header, LF,
    ESC, 0x61, 0x00, // Left
    ...line, LF,
    ...date, LF,
    LF, LF, LF,
    GS, 0x56, 0x42, 0x00, // Full cut
  ]);
}

// Common BLE service UUIDs for thermal printers (expanded list)
const BLE_PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "00001101-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "000001ff-0000-1000-8000-00805f9b34fb",
];

type DetectedPrinter = {
  name: string;
  type: "bluetooth" | "usb";
  connected: boolean;
  device?: BluetoothDevice;
  usbDevice?: USBDevice;
};

export default function PrintSettings() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const { user } = useAuth();

  const isOwner = user?.role === "owner";

  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>([]);
  const [scanningBt, setScanningBt] = useState(false);
  const [scanningUsb, setScanningUsb] = useState(false);
  const [testingPrint, setTestingPrint] = useState<string | null>(null);
  const bleDeviceRef = useRef<BluetoothDevice | null>(null);

  // Auto-reconnect previously paired BLE printers on mount
  useEffect(() => {
    const ble = (navigator as any).bluetooth;
    if (!ble || typeof ble.getDevices !== "function") return;
    ble.getDevices().then(async (devices: BluetoothDevice[]) => {
      for (const device of devices) {
        const name = device.name || "Bluetooth Printer";
        try {
          const server = await device.gatt?.connect();
          if (server?.connected) {
            bleDeviceRef.current = device;
            setDetectedPrinters(prev => {
              if (prev.some(p => p.type === "bluetooth" && p.name === name)) return prev;
              return [...prev, { name, type: "bluetooth", connected: true, device }];
            });
          }
        } catch {
          // Device not in range or refused — add as disconnected so user can see it
          setDetectedPrinters(prev => {
            if (prev.some(p => p.type === "bluetooth" && p.name === name)) return prev;
            return [...prev, { name, type: "bluetooth", connected: false, device }];
          });
        }
      }
    }).catch(() => {});
  }, []);

  const scanBluetooth = async () => {
    if (!(navigator as any).bluetooth) {
      toast({ title: "Not supported", description: "Web Bluetooth is not available. Use Chrome on desktop or Android.", variant: "destructive" });
      return;
    }
    setScanningBt(true);
    try {
      const device: BluetoothDevice = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINT_SERVICES,
      });
      bleDeviceRef.current = device;
      const name = device.name || "Bluetooth Printer";
      const printer: DetectedPrinter = { name, type: "bluetooth", connected: false, device };
      setDetectedPrinters(prev => {
        const others = prev.filter(p => !(p.type === "bluetooth" && p.name === name));
        return [...others, printer];
      });
      // Try GATT connect
      try {
        const server = await device.gatt?.connect();
        if (server?.connected) {
          setDetectedPrinters(prev => prev.map(p => p.name === name && p.type === "bluetooth" ? { ...p, connected: true } : p));
          toast({ title: "Printer connected", description: `${name} is ready.` });
        }
      } catch {
        toast({ title: "Device found", description: `${name} detected but could not auto-connect. Try Test Print to connect.` });
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError" && err.name !== "NotAllowedError") {
        toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setScanningBt(false);
    }
  };

  const scanUsb = async () => {
    if (!(navigator as any).usb) {
      toast({ title: "Not supported", description: "WebUSB is not available. Use Chrome on desktop.", variant: "destructive" });
      return;
    }
    setScanningUsb(true);
    try {
      const device: USBDevice = await (navigator as any).usb.requestDevice({ filters: [] });
      const name = device.productName || device.manufacturerName || "USB Printer";
      const printer: DetectedPrinter = { name, type: "usb", connected: false, usbDevice: device };
      setDetectedPrinters(prev => {
        const others = prev.filter(p => !(p.type === "usb" && p.name === name));
        return [...others, printer];
      });
      try {
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);
        setDetectedPrinters(prev => prev.map(p => p.name === name && p.type === "usb" ? { ...p, connected: true } : p));
        toast({ title: "USB Printer connected", description: `${name} is ready.` });
      } catch {
        toast({ title: "Device found", description: `${name} detected. Use Test Print to send a test page.` });
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError" && err.name !== "NotAllowedError") {
        toast({ title: "USB scan failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setScanningUsb(false);
    }
  };

  const writeToCharacteristic = async (char: BluetoothRemoteGATTCharacteristic, data: Uint8Array): Promise<boolean> => {
    const CHUNK = 512;
    try {
      for (let i = 0; i < data.length; i += CHUNK) {
        await char.writeValueWithoutResponse(data.slice(i, i + CHUNK));
      }
      return true;
    } catch {
      try {
        for (let i = 0; i < data.length; i += CHUNK) {
          await char.writeValue(data.slice(i, i + CHUNK));
        }
        return true;
      } catch {
        return false;
      }
    }
  };

  const testPrint = async (printer: DetectedPrinter) => {
    setTestingPrint(printer.name);
    const data = buildTestPrintData((settings as any)?.storeName || "ArtixPOS");
    try {
      if (printer.type === "bluetooth" && printer.device) {
        let server = printer.device.gatt?.connected ? printer.device.gatt : null;
        if (!server?.connected) server = await printer.device.gatt?.connect() ?? null;
        if (!server) throw new Error("Could not connect to printer");

        let wrote = false;

        // First try: enumerate ALL services the device actually has
        try {
          const allServices = await server.getPrimaryServices();
          for (const svc of allServices) {
            if (wrote) break;
            try {
              const chars = await svc.getCharacteristics();
              for (const char of chars) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                  wrote = await writeToCharacteristic(char, data);
                  if (wrote) break;
                }
              }
              // If property flags didn't help, try every characteristic anyway
              if (!wrote) {
                for (const char of chars) {
                  wrote = await writeToCharacteristic(char, data);
                  if (wrote) break;
                }
              }
            } catch {}
          }
        } catch {}

        // Second try: fallback to known service UUIDs if getPrimaryServices() failed
        if (!wrote) {
          for (const svcUuid of BLE_PRINT_SERVICES) {
            if (wrote) break;
            try {
              const svc = await server.getPrimaryService(svcUuid);
              const chars = await svc.getCharacteristics();
              for (const char of chars) {
                wrote = await writeToCharacteristic(char, data);
                if (wrote) break;
              }
            } catch {}
          }
        }

        if (!wrote) throw new Error("No writable characteristic found. Make sure the printer is on, in range, and supports BLE printing.");
        setDetectedPrinters(prev => prev.map(p => p.name === printer.name && p.type === "bluetooth" ? { ...p, connected: true } : p));
        toast({ title: "Test print sent!", description: `Check your ${printer.name} for the test receipt.` });
      } else if (printer.type === "usb" && printer.usbDevice) {
        const dev = printer.usbDevice;
        if (!dev.opened) await dev.open();
        if (dev.configuration === null) await dev.selectConfiguration(1);
        try { await dev.claimInterface(0); } catch {}
        await dev.transferOut(1, data);
        setDetectedPrinters(prev => prev.map(p => p.name === printer.name && p.type === "usb" ? { ...p, connected: true } : p));
        toast({ title: "Test print sent!", description: `Check your ${printer.name} for the test receipt.` });
      }
    } catch (err: any) {
      toast({ title: "Print failed", description: err.message, variant: "destructive" });
    } finally {
      setTestingPrint(null);
    }
  };

  const removePrinter = (printer: DetectedPrinter) => {
    try { printer.device?.gatt?.disconnect(); } catch {}
    setDetectedPrinters(prev => prev.filter(p => !(p.name === printer.name && p.type === printer.type)));
  };

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

      {/* ── Thermal Printer Detection ─────────────────────────────────────── */}
      <SectionLabel>Thermal Printer</SectionLabel>
      <div className="bg-card rounded-2xl border border-border/25 px-4 py-3 shadow-sm mb-2">
        <div className="flex flex-wrap gap-2 mb-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg gap-1.5 text-xs font-medium"
            onClick={scanBluetooth}
            disabled={scanningBt || scanningUsb}
            data-testid="button-scan-bluetooth"
          >
            {scanningBt ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
            {scanningBt ? "Scanning…" : "Scan Bluetooth"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg gap-1.5 text-xs font-medium"
            onClick={scanUsb}
            disabled={scanningBt || scanningUsb}
            data-testid="button-scan-usb"
          >
            {scanningUsb ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Usb className="h-3.5 w-3.5" />}
            {scanningUsb ? "Scanning…" : "Scan USB"}
          </Button>
          <p className="text-[11px] text-muted-foreground self-center ml-1 hidden sm:block">
            Requires Chrome browser + HTTPS
          </p>
        </div>

        {detectedPrinters.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1">No printers detected yet. Click Scan to find a nearby printer.</p>
        ) : (
          <div className="space-y-2">
            {detectedPrinters.map(printer => (
              <div
                key={`${printer.type}-${printer.name}`}
                className="flex items-center gap-3 bg-secondary/40 rounded-xl px-3 py-2.5"
                data-testid={`printer-item-${printer.name.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <div className="shrink-0">
                  {printer.type === "bluetooth"
                    ? <Bluetooth className="h-4 w-4 text-primary" />
                    : <Usb className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" data-testid={`printer-name-${printer.name.replace(/\s+/g, "-").toLowerCase()}`}>{printer.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {printer.connected
                      ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      : <Circle className="h-3 w-3 text-muted-foreground" />}
                    <span
                      className={`text-[11px] ${printer.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                      data-testid={`printer-status-${printer.name.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      {printer.connected ? "Connected" : "Detected — not connected"}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1">
                      {printer.type === "bluetooth" ? "BLE" : "USB"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 rounded-lg text-xs gap-1"
                    onClick={() => testPrint(printer)}
                    disabled={testingPrint === printer.name}
                    data-testid={`button-test-print-${printer.name.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {testingPrint === printer.name
                      ? <RefreshCw className="h-3 w-3 animate-spin" />
                      : <Zap className="h-3 w-3" />}
                    {testingPrint === printer.name ? "Printing…" : "Test Print"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => removePrinter(printer)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    data-testid={`button-remove-printer-${printer.name.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
