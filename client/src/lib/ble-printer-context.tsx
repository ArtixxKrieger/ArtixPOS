import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

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

async function writeDataToServer(
  server: BluetoothRemoteGATTServer,
  data: Uint8Array,
): Promise<boolean> {
  const CHUNK = 512;

  const tryWrite = async (char: BluetoothRemoteGATTCharacteristic): Promise<boolean> => {
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

  try {
    const allServices = await server.getPrimaryServices();
    for (const svc of allServices) {
      try {
        const chars = await svc.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            const ok = await tryWrite(char);
            if (ok) return true;
          }
        }
        for (const char of chars) {
          const ok = await tryWrite(char);
          if (ok) return true;
        }
      } catch {}
    }
  } catch {}

  for (const uuid of BLE_PRINT_SERVICES) {
    try {
      const svc = await server.getPrimaryService(uuid);
      const chars = await svc.getCharacteristics();
      for (const char of chars) {
        const ok = await tryWrite(char);
        if (ok) return true;
      }
    } catch {}
  }

  return false;
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
    if (!ble) return { device: null, error: "Web Bluetooth is not available. Use Chrome on Android or desktop." };
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
    if (!device) return { ok: false, error: "No printer paired. Go to Print Settings and scan for your printer first." };

    try {
      let server = device.gatt?.connected ? device.gatt! : null;
      if (!server) {
        server = await device.gatt?.connect() ?? null;
      }
      if (!server) return { ok: false, error: "Could not connect to printer. Make sure it is on and in range." };

      setPrinter(prev => ({ ...prev, connected: true }));

      const wrote = await writeDataToServer(server, data);
      if (!wrote) return { ok: false, error: "Printer connected but could not send data. The printer may not support direct BLE printing." };
      return { ok: true };
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
