import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import {
  CAT_SERVICE,
  CAT_WRITE_CH,
  buildCatPrinterPackets,
} from "./catprinter";

// ─── ESC/POS services (standard printers) ───────────────────────────────────

const KNOWN_ESCPOS_CHARS: Record<string, string[]> = {
  "000018f0-0000-1000-8000-00805f9b34fb": [
    "00002af1-0000-1000-8000-00805f9b34fb",
  ],
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2": [
    "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f",
  ],
  "49535343-fe7d-4ae5-8fa9-9fafd205e455": [
    "49535343-8841-43f4-a8d4-ecbe34729bb3",
    "49535343-1e4d-4bd9-ba61-23c647249616",
  ],
  "0000ff00-0000-1000-8000-00805f9b34fb": [
    "0000ff02-0000-1000-8000-00805f9b34fb",
    "0000ff01-0000-1000-8000-00805f9b34fb",
  ],
  "0000ffe0-0000-1000-8000-00805f9b34fb": [
    "0000ffe1-0000-1000-8000-00805f9b34fb",
  ],
  "0000fff0-0000-1000-8000-00805f9b34fb": [
    "0000fff2-0000-1000-8000-00805f9b34fb",
    "0000fff1-0000-1000-8000-00805f9b34fb",
  ],
};

// All service UUIDs we need declared for optionalServices
const BLE_PRINT_SERVICES = [
  ...Object.keys(KNOWN_ESCPOS_CHARS),
  CAT_SERVICE,
  "0000ae3a-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "00001101-0000-1000-8000-00805f9b34fb",
  "000001ff-0000-1000-8000-00805f9b34fb",
];

// Larger chunks = fewer BLE round-trips = print completes before user can switch apps
const CHUNK_SIZE = 512;
// Minimal delay between ESC/POS chunks — printers buffer incoming data, 5ms is enough
const CHUNK_DELAY = 5;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Protocol detection ──────────────────────────────────────────────────────

async function detectProtocol(
  server: BluetoothRemoteGATTServer,
): Promise<"catprinter" | "escpos"> {
  try {
    await server.getPrimaryService(CAT_SERVICE);
    return "catprinter";
  } catch {
    return "escpos";
  }
}

// ─── Cat printer writer ──────────────────────────────────────────────────────

async function writeCatPackets(
  server: BluetoothRemoteGATTServer,
  packets: number[][],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const svc = await server.getPrimaryService(CAT_SERVICE);
    const [char] = await svc.getCharacteristics(CAT_WRITE_CH);
    if (!char) return { ok: false, error: "Cat printer write characteristic not found." };

    for (const pkt of packets) {
      await char.writeValueWithoutResponse(new Uint8Array(pkt));
      await sleep(35);
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── ESC/POS writer ─────────────────────────────────────────────────────────

type CharCache = { svcUuid: string; charUuid: string };

async function writeEscPos(
  server: BluetoothRemoteGATTServer,
  data: Uint8Array,
  cache: CharCache | null,
  onCacheHit: (c: CharCache) => void,
): Promise<{ ok: boolean; error?: string }> {
  const tryWrite = async (char: BluetoothRemoteGATTCharacteristic): Promise<boolean> => {
    try {
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        if (char.properties.writeWithoutResponse) {
          await char.writeValueWithoutResponse(chunk);
        } else {
          await char.writeValue(chunk);
        }
        if (CHUNK_DELAY > 0 && i + CHUNK_SIZE < data.length) await sleep(CHUNK_DELAY);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Pass 0: use cached characteristic (fastest path — avoids all service discovery)
  if (cache) {
    try {
      const svc = await server.getPrimaryService(cache.svcUuid);
      const [char] = await svc.getCharacteristics(cache.charUuid);
      if (char) {
        const ok = await tryWrite(char);
        if (ok) return { ok: true };
      }
    } catch {}
  }

  // Pass 1: known service → known characteristic map
  for (const [svcUuid, charUuids] of Object.entries(KNOWN_ESCPOS_CHARS)) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      for (const charUuid of charUuids) {
        try {
          const [char] = await svc.getCharacteristics(charUuid);
          if (!char) continue;
          const ok = await tryWrite(char);
          if (ok) {
            onCacheHit({ svcUuid, charUuid });
            return { ok: true };
          }
        } catch {}
      }
    } catch {}
  }

  // Pass 2: enumerate all exposed services (slow — only runs once then cache takes over)
  try {
    const allServices = await server.getPrimaryServices();
    for (const svc of allServices) {
      try {
        const chars = await svc.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            const ok = await tryWrite(char);
            if (ok) {
              onCacheHit({ svcUuid: svc.uuid, charUuid: char.uuid });
              return { ok: true };
            }
          }
        }
      } catch {}
    }
  } catch {}

  return {
    ok: false,
    error: "No writable print characteristic found. Make sure the printer is on, in range, and in BLE mode.",
  };
}

// ─── Context types ───────────────────────────────────────────────────────────

type Protocol = "catprinter" | "escpos" | null;

type BlePrinterState = {
  name: string | null;
  connected: boolean;
  protocol: Protocol;
};

type PrintArgs =
  | { escpos: Uint8Array; catText: string; energy?: number; catReceiptWidth?: string; catFontSize?: number }
  | { catText: string; energy?: number; catReceiptWidth?: string; catFontSize?: number }
  | { escpos: Uint8Array };

type BlePrinterContextType = {
  printer: BlePrinterState;
  scanning: boolean;
  scan: () => Promise<{ device: BluetoothDevice | null; error?: string }>;
  disconnect: () => void;
  print: (args: PrintArgs) => Promise<{ ok: boolean; error?: string }>;
};

const BlePrinterContext = createContext<BlePrinterContextType | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

const MAX_RECONNECT_ATTEMPTS = 5;

export function BlePrinterProvider({ children }: { children: React.ReactNode }) {
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Caches the last-known working service/characteristic per device to skip service discovery
  const charCacheRef = useRef<CharCache | null>(null);

  const [printer, setPrinter] = useState<BlePrinterState>({
    name: null,
    connected: false,
    protocol: null,
  });
  const [scanning, setScanning] = useState(false);

  // ── Reconnect logic ────────────────────────────────────────────────────────
  const scheduleReconnect = useCallback((device: BluetoothDevice) => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
    reconnectAttemptsRef.current++;
    const delay = Math.min(1000 * reconnectAttemptsRef.current, 8000);

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = setTimeout(async () => {
      try {
        const server = await device.gatt?.connect();
        if (server?.connected) {
          reconnectAttemptsRef.current = 0;
          const proto = await detectProtocol(server);
          setPrinter({ name: device.name || "Bluetooth Printer", connected: true, protocol: proto });
        } else {
          scheduleReconnect(device);
        }
      } catch {
        scheduleReconnect(device);
      }
    }, delay);
  }, []);

  const attachDisconnectListener = useCallback((device: BluetoothDevice) => {
    const handler = () => {
      setPrinter(prev => ({ ...prev, connected: false }));
      scheduleReconnect(device);
    };
    device.removeEventListener("gattserverdisconnected", handler as EventListener);
    device.addEventListener("gattserverdisconnected", handler as EventListener);
  }, [scheduleReconnect]);

  const applyConnected = useCallback(
    async (device: BluetoothDevice, server: BluetoothRemoteGATTServer) => {
      const protocol = await detectProtocol(server);
      deviceRef.current = device;
      reconnectAttemptsRef.current = 0;
      setPrinter({ name: device.name || "Bluetooth Printer", connected: true, protocol });
      attachDisconnectListener(device);
    },
    [attachDisconnectListener],
  );

  // Auto-reconnect previously paired devices on mount
  useEffect(() => {
    const ble = (navigator as any).bluetooth;
    if (!ble || typeof ble.getDevices !== "function") return;

    ble.getDevices().then(async (devices: BluetoothDevice[]) => {
      for (const device of devices) {
        try {
          const server = await device.gatt?.connect();
          if (server?.connected) {
            await applyConnected(device, server);
            break;
          }
        } catch {}
      }
    }).catch(() => {});
  }, [applyConnected]);

  const scan = useCallback(async (): Promise<{ device: BluetoothDevice | null; error?: string }> => {
    const ble = (navigator as any).bluetooth;
    if (!ble) {
      return { device: null, error: "Web Bluetooth is not available. Use Chrome on Android or desktop." };
    }
    setScanning(true);
    try {
      const device: BluetoothDevice = await ble.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINT_SERVICES,
      });

      try {
        const server = await device.gatt?.connect();
        if (server?.connected) {
          await applyConnected(device, server);
        } else {
          deviceRef.current = device;
          setPrinter({ name: device.name || "Bluetooth Printer", connected: false, protocol: null });
          attachDisconnectListener(device);
        }
      } catch {
        deviceRef.current = device;
        setPrinter({ name: device.name || "Bluetooth Printer", connected: false, protocol: null });
        attachDisconnectListener(device);
      }

      return { device };
    } catch (err: any) {
      if (err.name === "NotFoundError" || err.name === "NotAllowedError") {
        return { device: null };
      }
      return { device: null, error: err.message };
    } finally {
      setScanning(false);
    }
  }, [applyConnected, attachDisconnectListener]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // Stop auto-reconnect
    try { deviceRef.current?.gatt?.disconnect(); } catch {}
    deviceRef.current = null;
    charCacheRef.current = null;
    setPrinter({ name: null, connected: false, protocol: null });
  }, []);

  const print = useCallback(async (
    args: PrintArgs,
  ): Promise<{ ok: boolean; error?: string }> => {
    const device = deviceRef.current;
    if (!device) {
      return { ok: false, error: "No printer paired. Go to Print Settings and scan for your printer first." };
    }

    // Inner function to attempt one print operation
    const attemptPrint = async (): Promise<{ ok: boolean; error?: string }> => {
      try {
        let server = device.gatt?.connected ? device.gatt! : null;
        if (!server) {
          server = await device.gatt?.connect() ?? null;
        }
        if (!server) {
          return { ok: false, error: "Could not connect to printer. Make sure it is on and in range." };
        }

        let proto = printer.protocol;
        if (!proto) {
          proto = await detectProtocol(server);
          setPrinter(prev => ({ ...prev, connected: true, protocol: proto }));
        } else {
          setPrinter(prev => ({ ...prev, connected: true }));
        }

        if (proto === "catprinter") {
          const text = "catText" in args ? args.catText : null;
          if (!text) return { ok: false, error: "This printer requires bitmap data. Please retry printing." };
          const energy = "energy" in args ? (args.energy ?? 65535) : 65535;
          const catReceiptWidth = "catReceiptWidth" in args ? (args.catReceiptWidth ?? "58mm") : "58mm";
          const catFontSize = "catFontSize" in args ? args.catFontSize : undefined;
          const packets = buildCatPrinterPackets(text, energy, catReceiptWidth, catFontSize);
          return writeCatPackets(server, packets);
        }

        const escpos = "escpos" in args ? args.escpos : null;
        if (!escpos) return { ok: false, error: "ESC/POS data is required for this printer." };

        return writeEscPos(server, escpos, charCacheRef.current, (c) => {
          charCacheRef.current = c;
        });
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    };

    // First attempt
    let result = await attemptPrint();

    // If it failed due to a connection issue, reconnect once and retry
    if (!result.ok && device.gatt) {
      try {
        await device.gatt.connect();
        result = await attemptPrint();
      } catch {}
    }

    return result;
  }, [printer.protocol]);

  return (
    <BlePrinterContext.Provider value={{ printer, scanning, scan, disconnect, print }}>
      {children}
    </BlePrinterContext.Provider>
  );
}

export function useBlePrinter() {
  const ctx = useContext(BlePrinterContext);
  if (!ctx) throw new Error("useBlePrinter must be used inside BlePrinterProvider");
  return ctx;
}
