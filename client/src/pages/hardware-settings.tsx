import { useState, useRef, useCallback, useEffect } from "react";
import { Cpu, Usb, ScanBarcode, CheckCircle2, Circle, Zap, Info, Printer, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { buildTestPrintEscPos } from "@/lib/escpos";
import { useSettings } from "@/hooks/use-settings";
import { BARCODE_BURST_MS, MIN_BARCODE_LENGTH, GS1_AIM_PREFIXES } from "@/constants/pos";

// ─── Shared layout helpers ────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Cpu className="w-4 h-4 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground tracking-tight">Hardware Settings</h1>
      </div>
      <p className="text-sm text-muted-foreground pl-10">
        Manage your barcode scanners and thermal printers. All USB models work plug-and-play — no drivers needed.
      </p>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {badge}
    </div>
  );
}

function StatusBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={[
      "inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full",
      active
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground",
    ].join(" ")}>
      <span className={[
        "w-1.5 h-1.5 rounded-full",
        active ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40",
      ].join(" ")} />
      {label}
    </span>
  );
}

// ─── Barcode scanner helpers ──────────────────────────────────────────────────

function cleanBarcode(raw: string): string {
  let s = raw;
  for (const prefix of GS1_AIM_PREFIXES) {
    if (s.startsWith(prefix)) { s = s.slice(prefix.length); break; }
  }
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

// ─── Barcode Scanner Section ──────────────────────────────────────────────────

interface ScanEntry {
  barcode: string;
  at: Date;
}

function BarcodeScannerSection() {
  const [lastScan, setLastScan] = useState<ScanEntry | null>(null);
  const [flash, setFlash] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const activityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup timer on unmount to avoid state-update-on-unmounted-component warnings
  useEffect(() => {
    return () => {
      if (activityTimer.current) clearTimeout(activityTimer.current);
    };
  }, []);

  const markActive = useCallback(() => {
    setIsActive(true);
    if (activityTimer.current) clearTimeout(activityTimer.current);
    activityTimer.current = setTimeout(() => setIsActive(false), 60_000);
  }, []);

  const handleScan = useCallback((barcode: string) => {
    setLastScan({ barcode, at: new Date() });
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
    markActive();
  }, [markActive]);

  // Global burst-detection listener (mirrors useBarcodeScanner logic)
  useEffect(() => {
    let buffer = "";
    let lastCharAt = 0;

    function onKeyDown(e: KeyboardEvent) {
      // If test-mode input is focused, let its own handler run
      if (testInputRef.current && document.activeElement === testInputRef.current) return;

      const now = Date.now();
      const gap = now - lastCharAt;

      const isTerminator = e.key === "Enter" || e.key === "Tab" || e.key === "\r";
      if (isTerminator) {
        if (buffer.length >= MIN_BARCODE_LENGTH) {
          const cleaned = cleanBarcode(buffer);
          if (cleaned.length >= MIN_BARCODE_LENGTH) handleScan(cleaned);
        }
        buffer = "";
        lastCharAt = 0;
        return;
      }
      if (e.key === "Escape") { buffer = ""; lastCharAt = 0; return; }
      if (e.key.length !== 1) return;
      if (gap > BARCODE_BURST_MS && buffer.length > 0) buffer = "";
      buffer += e.key;
      lastCharAt = now;
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleScan]);

  // Test-mode input: scanner types into the dedicated field
  function onTestInput(e: React.KeyboardEvent<HTMLInputElement>) {
    const isTerminator = e.key === "Enter" || e.key === "Tab";
    if (!isTerminator) return;
    e.preventDefault();
    const val = (e.target as HTMLInputElement).value.trim();
    if (val.length >= MIN_BARCODE_LENGTH) {
      const cleaned = cleanBarcode(val);
      if (cleaned.length >= MIN_BARCODE_LENGTH) handleScan(cleaned);
    }
    (e.target as HTMLInputElement).value = "";
  }

  useEffect(() => {
    if (testMode) setTimeout(() => testInputRef.current?.focus(), 50);
  }, [testMode]);

  return (
    <SectionCard>
      <SectionHeader
        icon={ScanBarcode}
        title="Barcode Scanner"
        badge={<StatusBadge active={isActive} label={isActive ? "Active" : "Ready"} />}
      />

      <div className="p-4 space-y-4">
        {/* Info banner */}
        <div className="flex gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-blue-700 dark:text-blue-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold mb-0.5">Plug-and-play — no setup needed</p>
            <p className="text-blue-600/80 dark:text-blue-300/70">
              Any USB, Bluetooth, or wireless barcode scanner works automatically. Just plug it in and scan a product
              at the POS. The scanner types like a keyboard — the app detects the high-speed burst and looks up
              the product instantly.
            </p>
          </div>
        </div>

        {/* Compatible scanners */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Compatible Scanners</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {[
              "USB HID (any brand)",
              "Wireless 2.4 GHz dongle",
              "Bluetooth HID",
              "Zebra / Symbol",
              "Honeywell / Metrologic",
              "Newland / Datalogic",
            ].map(model => (
              <div key={model} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                {model}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Live test area */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Test Your Scanner</p>
          <div className={[
            "relative rounded-lg border-2 transition-all duration-300 p-4",
            flash
              ? "border-emerald-500 bg-emerald-500/5"
              : testMode
                ? "border-primary/40 bg-primary/5"
                : "border-dashed border-border",
          ].join(" ")}>
            {testMode ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground text-center">
                  Scanner is listening — aim at any barcode and scan now
                </p>
                <input
                  ref={testInputRef}
                  onKeyDown={onTestInput}
                  placeholder="Scan here…"
                  data-testid="input-scanner-test"
                  className="w-full text-center text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="flex justify-center">
                  <button
                    onClick={() => setTestMode(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Stop testing
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <ScanBarcode className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  Scan any barcode anywhere in the app — it's always listening
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTestMode(true)}
                  data-testid="button-test-scanner"
                >
                  Open Test Area
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Last scan result */}
        {lastScan && (
          <div className={[
            "flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-all duration-300",
            flash ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-muted/40 border border-border/40",
          ].join(" ")}>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Last Scan</p>
              <p className="text-sm font-mono font-bold text-foreground truncate" data-testid="text-last-barcode">
                {lastScan.barcode}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-muted-foreground">{lastScan.at.toLocaleTimeString()}</p>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto mt-0.5" />
            </div>
          </div>
        )}

        {/* Tip */}
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Tip: The green "Active" badge lights up whenever your scanner fires. If you don't see it activate,
          make sure your scanner's suffix key is set to <strong>Enter</strong> or <strong>Tab</strong> (factory default on most models).
        </p>
      </div>
    </SectionCard>
  );
}

// ─── USB Thermal Printer Section ──────────────────────────────────────────────

type UsbPrinter = { name: string; device: USBDevice; connected: boolean };

function UsbPrinterSection() {
  const { data: settings } = useSettings();
  const { toast } = useToast();
  const [printers, setPrinters] = useState<UsbPrinter[]>([]);
  const [scanning, setScanning] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const webUsbSupported = typeof navigator !== "undefined" && !!(navigator as any).usb;

  // Re-enumerate previously granted WebUSB devices on mount
  useEffect(() => {
    if (!webUsbSupported) return;
    (navigator as any).usb.getDevices().then((devices: USBDevice[]) => {
      const found: UsbPrinter[] = devices.map((d: USBDevice) => ({
        name: d.productName || d.manufacturerName || "USB Printer",
        device: d,
        connected: false,
      }));
      setPrinters(found);
    }).catch(() => {});
  }, [webUsbSupported]);

  async function addPrinter() {
    setScanning(true);
    try {
      // filters: [] → shows every USB device — works with every thermal printer brand
      const device: USBDevice = await (navigator as any).usb.requestDevice({ filters: [] });
      const name = device.productName || device.manufacturerName || "USB Printer";
      setPrinters(prev => {
        const others = prev.filter(p => p.device !== device);
        return [...others, { name, device, connected: false }];
      });
      // Try to open & claim right away to show connected status immediately
      try {
        await device.open();
        if (device.configuration === null) await device.selectConfiguration(1);
        await device.claimInterface(0);
        setPrinters(prev => prev.map(p => p.device === device ? { ...p, connected: true } : p));
        toast({ title: "Printer connected", description: `${name} is ready to print.` });
      } catch {
        toast({ title: "Printer added", description: `${name} detected. Press Test Print to verify.` });
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError" && err.name !== "NotAllowedError") {
        toast({ title: "Could not add printer", description: err.message, variant: "destructive" });
      }
    } finally {
      setScanning(false);
    }
  }

  async function testPrint(printer: UsbPrinter) {
    setTesting(printer.name);
    const storeName = (settings as any)?.storeName || "ArtixPOS";
    const receiptWidth: string = (settings as any)?.receiptWidth ?? "58mm";
    const data = buildTestPrintEscPos(storeName, receiptWidth);
    try {
      const dev = printer.device;
      if (!dev.opened) await dev.open();
      if (dev.configuration === null) await dev.selectConfiguration(1);
      // Try interfaces 0–2 (different brands expose different interface numbers)
      for (let iface = 0; iface <= 2; iface++) {
        try { await dev.claimInterface(iface); } catch {}
      }
      // Try endpoints 1–3 (Epson=1, Xprinter=2, Star=1, Rongta=2, etc.)
      let sent = false;
      for (const ep of [1, 2, 3]) {
        try {
          const result = await dev.transferOut(ep, data);
          if (result.status === "ok" || result.bytesWritten > 0) { sent = true; break; }
        } catch {}
      }
      if (sent) {
        setPrinters(prev => prev.map(p => p.device === printer.device ? { ...p, connected: true } : p));
        toast({ title: "Test print sent!", description: `Check your ${printer.name} for the test receipt.` });
      } else {
        toast({ title: "Print failed", description: "No working USB endpoint found. Try a different USB cable.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Print failed", description: err.message, variant: "destructive" });
    } finally {
      setTesting(null);
    }
  }

  function removePrinter(printer: UsbPrinter) {
    try { printer.device.close(); } catch {}
    setPrinters(prev => prev.filter(p => p.device !== printer.device));
  }

  const anyConnected = printers.some(p => p.connected);

  return (
    <SectionCard>
      <SectionHeader
        icon={Printer}
        title="USB Thermal Printer"
        badge={<StatusBadge active={anyConnected} label={anyConnected ? "Connected" : "No printer"} />}
      />

      <div className="p-4 space-y-4">
        {/* Browser support warning */}
        {!webUsbSupported && (
          <div className="flex gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold mb-0.5">Chrome or Edge required for USB printing</p>
              <p className="text-amber-600/80 dark:text-amber-300/70">
                Your current browser doesn't support WebUSB. Open ArtixPOS in Google Chrome or Microsoft Edge on a
                desktop or Android device to connect a USB thermal printer.
              </p>
            </div>
          </div>
        )}

        {/* Info banner (only when supported) */}
        {webUsbSupported && (
          <div className="flex gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-blue-700 dark:text-blue-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs leading-relaxed">
              <p className="font-semibold mb-0.5">Plug-and-play for all thermal printer brands</p>
              <p className="text-blue-600/80 dark:text-blue-300/70">
                Plug your printer into a USB port, click "Add Printer", select it from the browser popup, then press
                Test Print. Receipts print using ESC/POS — the standard protocol supported by every major thermal
                printer brand.
              </p>
            </div>
          </div>
        )}

        {/* Compatible brands */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2">Compatible Brands</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {[
              "Epson TM-series",
              "Xprinter XP-series",
              "Star Micronics TSP",
              "Bixolon SRP-series",
              "Rongta RP-series",
              "Munbyn ITPP-series",
              "Hoin HOP-series",
              "Citizen CT-series",
              "Any ESC/POS printer",
            ].map(brand => (
              <div key={brand} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                {brand}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border/40" />

        {/* Printer list */}
        {printers.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Connected Printers</p>
            {printers.map(printer => (
              <div
                key={`${printer.device.vendorId}-${printer.device.productId}-${printer.name}`}
                data-testid={`card-printer-${printer.name}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20"
              >
                <div className={[
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  printer.connected ? "bg-emerald-500/10" : "bg-muted",
                ].join(" ")}>
                  <Printer className={["w-4 h-4", printer.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"].join(" ")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{printer.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {printer.connected ? "Connected · ESC/POS ready" : "Added · press Test Print to verify"}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    disabled={testing === printer.name}
                    onClick={() => testPrint(printer)}
                    data-testid={`button-test-print-${printer.name}`}
                  >
                    {testing === printer.name ? "Printing…" : <><Zap className="w-3 h-3 mr-1" />Test Print</>}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => removePrinter(printer)}
                    data-testid={`button-remove-printer-${printer.name}`}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add printer button */}
        {webUsbSupported && (
          <Button
            variant={printers.length === 0 ? "default" : "outline"}
            className="w-full"
            onClick={addPrinter}
            disabled={scanning}
            data-testid="button-add-usb-printer"
          >
            {scanning ? "Waiting for selection…" : <><Usb className="w-4 h-4 mr-2" />Add USB Printer</>}
          </Button>
        )}

        {/* Bluetooth note */}
        <div className="flex gap-2 text-xs text-muted-foreground/70 items-start pt-1">
          <Circle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            For Bluetooth printers (e.g. mini pocket printers), go to{" "}
            <a href="/print-settings" className="text-primary underline-offset-2 hover:underline">Print Settings</a>
            {" "}and use the Bluetooth section.
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HardwareSettings() {
  return (
    <div className="px-4 py-6 space-y-6">
      <PageHeader />
      <BarcodeScannerSection />
      <UsbPrinterSection />
    </div>
  );
}
