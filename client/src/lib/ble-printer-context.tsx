import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

// Service UUID → known print characteristic UUIDs for common thermal printers.
// Targeting the correct characteristic first prevents writing to wrong chars (e.g. battery).
const KNOWN_PRINT_CHARS: Record<string, string[]> = {
  "000018f0-0000-1000-8000-00805f9b34fb": [
    "00002af1-0000-1000-8000-00805f9b34fb", // Gainscha / Rongta / HPRT / SC03h
  ],
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2": [
    "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", // Xprinter XP-P300
  ],
  "49535343-fe7d-4ae5-8fa9-9fafd205e455": [
    "49535343-8841-43f4-a8d4-ecbe34729bb3", // ISSC UART Tx
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

const BLE_PRINT_SERVICES = Object.keys(KNOWN_PRINT_CHARS).concat([
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "00001101-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "000001ff-0000-1000-8000-00805f9b34fb",
]);

const CHUNK_SIZE = 100; // safe for most BLE MTU negotiations
const CHUNK_DELAY = 30;  // ms between chunks

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function writeChunked(
  char: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
): Promise<boolean> {
  try {
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (char.properties.writeWithoutResponse) {
        await char.writeValueWithoutResponse(chunk);
      } else {
        await char.writeValue(chunk);
      }
      if (CHUNK_DELAY > 0 && i + CHUNK_SIZE < data.length) {
        await sleep(CHUNK_DELAY);
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function writeDataToServer(
  server: BluetoothRemoteGATTServer,
  data: Uint8Array,
): Promise<{ ok: boolean; error?: string }> {
  // Pass 1: Try each known service → known characteristic mapping.
  // This ensures we send to the actual print buffer, not a config characteristic.
  for (const [svcUuid, charUuids] of Object.entries(KNOWN_PRINT_CHARS)) {
    try {
      const svc = await server.getPrimaryService(svcUuid);
      for (const charUuid of charUuids) {
        try {
          const char = await svc.getCharacteristic(charUuid);
          const ok = await writeChunked(char, data);
          if (ok) return { ok: true };
        } catch {}
      }
    } catch {}
  }

  // Pass 2: Enumerate all services the device exposes and try every writable
  // characteristic. This catches printers with non-standard or unknown UUIDs.
  try {
    const allServices = await server.getPrimaryServices();
    for (const svc of allServices) {
      try {
        const chars = await svc.getCharacteristics();
        // Try characteristics that declare write properties first
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            const ok = await writeChunked(char, data);
            if (ok) return { ok: true };
          }
        }
        // Last resort: try every characteristic in the service
        for (const char of chars) {
          const ok = await writeChunked(char, data);
          if (ok) return { ok: true };
        }
      } catch {}
    }
  } catch {}

  return {
    ok: false,
    error:
      "No writable print characteristic found. Make sure the printer is on, in range, and in BLE mode.",
  };
}

type BlePrinterState = {
  name: string | null;
  connected: boolean;
};

type BlePrinterContextType = {
  printer: BlePrinterState;
  scanning: boolean;
  scan: () => Promise<{ device: BluetoothDevice | null; error?: string }>;
  disconnect: () => void;
  print: (data: Uint8Array) => Promise<{ ok: boolean; error?: string }>;
};

const BlePrinterContext = createContext<BlePrinterContextType | null>(null);

export function BlePrinterProvider({ children }: { children: React.ReactNode }) {
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const [printer, setPrinter] = useState<BlePrinterState>({ name: null, connected: false });
  const [scanning, setScanning] = useState(false);

  const updateConnected = useCallback((device: BluetoothDevice, connected: boolean) => {
    deviceRef.current = device;
    setPrinter({ name: device.name || "Bluetooth Printer", connected });
  }, []);

  // Auto-reconnect previously paired devices on mount
  useEffect(() => {
    const ble = (navigator as any).bluetooth;
    if (!ble || typeof ble.getDevices !== "function") return;

    ble.getDevices().then(async (devices: BluetoothDevice[]) => {
      for (const device of devices) {
        try {
          const server = await device.gatt?.connect();
          if (server?.connected) {
            updateConnected(device, true);
            device.addEventListener("gattserverdisconnected", () => {
              setPrinter(prev => ({ ...prev, connected: false }));
            });
            break;
          }
        } catch {}
      }
    }).catch(() => {});
  }, [updateConnected]);

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
        updateConnected(device, !!server?.connected);
      } catch {
        updateConnected(device, false);
      }

      device.addEventListener("gattserverdisconnected", () => {
        setPrinter(prev => ({ ...prev, connected: false }));
      });

      return { device };
    } catch (err: any) {
      if (err.name === "NotFoundError" || err.name === "NotAllowedError") {
        return { device: null };
      }
      return { device: null, error: err.message };
    } finally {
      setScanning(false);
    }
  }, [updateConnected]);

  const disconnect = useCallback(() => {
    try { deviceRef.current?.gatt?.disconnect(); } catch {}
    deviceRef.current = null;
    setPrinter({ name: null, connected: false });
  }, []);

  const print = useCallback(async (data: Uint8Array): Promise<{ ok: boolean; error?: string }> => {
    const device = deviceRef.current;
    if (!device) {
      return { ok: false, error: "No printer paired. Go to Print Settings and scan for your printer first." };
    }

    try {
      let server = device.gatt?.connected ? device.gatt! : null;
      if (!server) {
        server = await device.gatt?.connect() ?? null;
      }
      if (!server) {
        return { ok: false, error: "Could not connect to printer. Make sure it is on and in range." };
      }

      setPrinter(prev => ({ ...prev, connected: true }));
      return await writeDataToServer(server, data);
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }, []);

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
