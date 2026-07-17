import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import {
  CAT_SERVICE,
  CAT_WRITE_CH,
  buildCatPrinterPackets,
} from "./catprinter";

const KNOWN_ESCPOS_CHARS: Record<string, string[]> = {

  "000018f0-0000-1000-8000-00805f9b34fb": [
    "00002af1-0000-1000-8000-00805f9b34fb",
    "00002af0-0000-1000-8000-00805f9b34fb",
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

  "0000ae30-0000-1000-8000-00805f9b34fb": [
    "0000ae01-0000-1000-8000-00805f9b34fb",
  ],

  "0000ae3a-0000-1000-8000-00805f9b34fb": [
    "0000ae01-0000-1000-8000-00805f9b34fb",
    "0000ae02-0000-1000-8000-00805f9b34fb",
  ],

  "0000fee7-0000-1000-8000-00805f9b34fb": [
    "0000fea1-0000-1000-8000-00805f9b34fb",
    "0000fea2-0000-1000-8000-00805f9b34fb",
  ],

  "0000180f-0000-1000-8000-00805f9b34fb": [
    "00002a19-0000-1000-8000-00805f9b34fb",
  ],

  "0000fde9-0000-1000-8000-00805f9b34fb": [
    "0000fd00-0000-1000-8000-00805f9b34fb",
  ],

  "00001000-0000-1000-8000-00805f9b34fb": [
    "00001001-0000-1000-8000-00805f9b34fb",
    "00001002-0000-1000-8000-00805f9b34fb",
  ],

  "38eb4a80-c570-11e3-9507-0002a5d5c51b": [
    "38eb4a82-c570-11e3-9507-0002a5d5c51b",
  ],

  "0000ab00-0000-1000-8000-00805f9b34fb": [
    "0000ab02-0000-1000-8000-00805f9b34fb",
    "0000ab01-0000-1000-8000-00805f9b34fb",
  ],

  "0000fee0-0000-1000-8000-00805f9b34fb": [
    "0000fee1-0000-1000-8000-00805f9b34fb",
  ],

  "0000ff12-0000-1000-8000-00805f9b34fb": [
    "0000ff02-0000-1000-8000-00805f9b34fb",
    "0000ff01-0000-1000-8000-00805f9b34fb",
  ],

  "49535343-c9d0-cc83-a44a-6fe4e3bfb746": [
    "49535343-fffb-4000-a44a-6fe4e3bfb746",
  ],
};

const BLE_PRINT_SERVICES = [
  ...Object.keys(KNOWN_ESCPOS_CHARS),
  CAT_SERVICE,
  "00001101-0000-1000-8000-00805f9b34fb",
  "000001ff-0000-1000-8000-00805f9b34fb",
  "0000ae40-0000-1000-8000-00805f9b34fb",
  "0000ae50-0000-1000-8000-00805f9b34fb",

  "0000fe00-0000-1000-8000-00805f9b34fb",
  "0000fde9-0000-1000-8000-00805f9b34fb",
  "00001000-0000-1000-8000-00805f9b34fb",
  "38eb4a80-c570-11e3-9507-0002a5d5c51b",
  "0000ab00-0000-1000-8000-00805f9b34fb",
  "0000fee0-0000-1000-8000-00805f9b34fb",
  "0000ff12-0000-1000-8000-00805f9b34fb",
  "49535343-c9d0-cc83-a44a-6fe4e3bfb746",
];

const CHUNK_SIZE = 100;

const CHUNK_DELAY = 20;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

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

try {
    const allServices = await server.getPrimaryServices();
    for (const svc of allServices) {
      try {
        const chars = await svc.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            const ok = await tryWrite(char);
            if (ok) {
              onCacheHit({ svcUuid: (svc as any).uuid, charUuid: (char as any).uuid });
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

export function detectPrinterWidth(name: string | null | undefined): "58mm" | "80mm" | null {
  if (!name) return null;
  const n = name.toLowerCase();

if (/\b80\b/.test(n)) return "80mm";
  if (/tm-?[tu]\d{2}|tm-?m[3-9]\d/.test(n)) return "80mm";
  if (/tsp\d{3}/.test(n)) return "80mm";
  if (/srp-?[789]\d{2}/.test(n)) return "80mm";
  if (/zq\d{2}0|zm\d{3}|qln\d{3}/.test(n)) return "80mm";
  if (/ct-?s[3-9]\d{2}/.test(n)) return "80mm";
  if (/cmp-?[3-9]\d{2}/.test(n)) return "80mm";
  if (/sm-?s\d{3}/.test(n)) return "80mm";
  if (/rp-?8\d{2}/.test(n)) return "80mm";
  if (/gp-?8\d{4}/.test(n)) return "80mm";

if (/\b58\b/.test(n)) return "58mm";
  if (/tm-?m[12]\d|tm-?t[12]\d/.test(n)) return "58mm";
  if (/sm-?l\d{3}/.test(n)) return "58mm";
  if (/srp-?[3-6]\d{2}|mtp-?ii|mtp-?3/.test(n)) return "58mm";
  if (/rpp\d{2,3}/.test(n)) return "58mm";
  if (/hoin|hop-?e[12]/.test(n)) return "58mm";
  if (/goojprt/.test(n)) return "58mm";
  if (/munbyn/.test(n)) return "58mm";
  if (/(\bhprt\b|\bidprt\b)/.test(n)) return "58mm";
  if (/rongta/.test(n)) return "58mm";
  if (/xprinter|xp-/.test(n)) return "58mm";
  if (/gp-[25]\d{4}/.test(n)) return "58mm";
  if (/rp-?[25]\d{2}/.test(n)) return "58mm";

  return null;
}

type Protocol = "catprinter" | "escpos" | null;

type BlePrinterState = {
  name: string | null;
  connected: boolean;
  protocol: Protocol;
  detectedWidth: "58mm" | "80mm" | null;
};

type PrintArgs =
  | { escpos: Uint8Array; catText: string; energy?: number; catReceiptWidth?: string; catFontSize?: number }
  | { catText: string; energy?: number; catReceiptWidth?: string; catFontSize?: number }
  | { escpos: Uint8Array };

const LAST_PRINTER_ID_KEY = "artixpos_last_ble_printer_id";

type BlePrinterContextType = {
  printer: BlePrinterState;
  scanning: boolean;
  lastPrinterId: string | null;
  scan: () => Promise<{ device: BluetoothDevice | null; error?: string }>;
  getPairedDevices: () => Promise<BluetoothDevice[]>;
  reconnectDevice: (device: BluetoothDevice) => Promise<void>;
  disconnect: () => void;
  print: (args: PrintArgs) => Promise<{ ok: boolean; error?: string }>;
};

const BlePrinterContext = createContext<BlePrinterContextType | null>(null);

const MAX_RECONNECT_ATTEMPTS = 5;

export function BlePrinterProvider({ children }: { children: React.ReactNode }) {
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charCacheRef = useRef<CharCache | null>(null);

  const [printer, setPrinter] = useState<BlePrinterState>({
    name: null,
    connected: false,
    protocol: null,
    detectedWidth: null,
  });
  const [scanning, setScanning] = useState(false);
  const [lastPrinterId, setLastPrinterId] = useState<string | null>(
    () => localStorage.getItem(LAST_PRINTER_ID_KEY)
  );

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
          setPrinter({ name: device.name || "Bluetooth Printer", connected: true, protocol: proto, detectedWidth: detectPrinterWidth(device.name) });
        } else {
          scheduleReconnect(device);
        }
      } catch {
        scheduleReconnect(device);
      }
    }, delay);
  }, []);

  const disconnectHandlerRef = useRef<(() => void) | null>(null);

  const attachDisconnectListener = useCallback((device: BluetoothDevice) => {
    if (disconnectHandlerRef.current) {
      device.removeEventListener("gattserverdisconnected", disconnectHandlerRef.current as EventListener);
    }
    const handler = () => {
      setPrinter(prev => ({ ...prev, connected: false }));
      scheduleReconnect(device);
    };
    disconnectHandlerRef.current = handler;
    device.addEventListener("gattserverdisconnected", handler as EventListener);
  }, [scheduleReconnect]);

  const applyConnected = useCallback(
    async (device: BluetoothDevice, server: BluetoothRemoteGATTServer) => {
      const protocol = await detectProtocol(server);
      deviceRef.current = device;
      reconnectAttemptsRef.current = 0;
      setPrinter({ name: device.name || "Bluetooth Printer", connected: true, protocol, detectedWidth: detectPrinterWidth(device.name) });
      attachDisconnectListener(device);

      localStorage.setItem(LAST_PRINTER_ID_KEY, device.id);
      setLastPrinterId(device.id);
    },
    [attachDisconnectListener],
  );

useEffect(() => {
    const ble = (navigator as any).bluetooth;
    if (!ble || typeof ble.getDevices !== "function") return;

    const savedId = localStorage.getItem(LAST_PRINTER_ID_KEY);

    ble.getDevices().then(async (devices: BluetoothDevice[]) => {

      const sorted = savedId
        ? [...devices].sort((a, b) => (a.id === savedId ? -1 : b.id === savedId ? 1 : 0))
        : devices;

      for (const device of sorted) {
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

  const getPairedDevices = useCallback(async (): Promise<BluetoothDevice[]> => {
    const ble = (navigator as any).bluetooth;
    if (!ble || typeof ble.getDevices !== "function") return [];
    try {
      return await ble.getDevices();
    } catch {
      return [];
    }
  }, []);

  const reconnectDevice = useCallback(async (device: BluetoothDevice): Promise<void> => {
    try {
      const server = await device.gatt?.connect();
      if (server?.connected) {
        await applyConnected(device, server);
      }
    } catch {}
  }, [applyConnected]);

  const scan = useCallback(async (): Promise<{ device: BluetoothDevice | null; error?: string }> => {
    const ble = (navigator as any).bluetooth;
    if (!ble) {
      const isLinux = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
      const error = isLinux
        ? "Web Bluetooth is not enabled. In Chrome, go to chrome://flags, search for \"Web Bluetooth\", enable it, then relaunch Chrome."
        : "Web Bluetooth is not available. Use Chrome on Android or desktop.";
      return { device: null, error };
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
          setPrinter({ name: device.name || "Bluetooth Printer", connected: false, protocol: null, detectedWidth: detectPrinterWidth(device.name) });
          attachDisconnectListener(device);
        }
      } catch {
        deviceRef.current = device;
        setPrinter({ name: device.name || "Bluetooth Printer", connected: false, protocol: null, detectedWidth: detectPrinterWidth(device.name) });
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
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    try { deviceRef.current?.gatt?.disconnect(); } catch {}
    deviceRef.current = null;
    charCacheRef.current = null;
    setPrinter({ name: null, connected: false, protocol: null, detectedWidth: null });
    localStorage.removeItem(LAST_PRINTER_ID_KEY);
    setLastPrinterId(null);
  }, []);

  const print = useCallback(async (
    args: PrintArgs,
  ): Promise<{ ok: boolean; error?: string }> => {
    const device = deviceRef.current;
    if (!device) {
      return { ok: false, error: "No printer paired. Go to Print Settings and scan for your printer first." };
    }

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

let result = await attemptPrint();

if (!result.ok && device.gatt) {
      try {
        await device.gatt.connect();
        result = await attemptPrint();
      } catch {}
    }

    return result;
  }, [printer.protocol]);

  return (
    <BlePrinterContext.Provider value={{ printer, scanning, lastPrinterId, scan, getPairedDevices, reconnectDevice, disconnect, print }}>
      {children}
    </BlePrinterContext.Provider>
  );
}

export function useBlePrinter() {
  const ctx = useContext(BlePrinterContext);
  if (!ctx) throw new Error("useBlePrinter must be used inside BlePrinterProvider");
  return ctx;
}
