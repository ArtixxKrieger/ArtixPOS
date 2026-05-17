/**
 * CameraScannerModal — uses the device camera + native BarcodeDetector API
 * to scan barcodes and QR codes. Falls back gracefully on unsupported browsers.
 *
 * Supported in Chrome 83+ on Android and Chrome 88+ on desktop.
 * Safari / Firefox show a "not supported" message and prompt manual entry.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, ScanLine, X } from "lucide-react";

interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Promise<Array<{ rawValue: string; format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

const ALL_FORMATS = [
  "aztec", "code_128", "code_39", "code_93", "codabar",
  "data_matrix", "ean_13", "ean_8", "itf", "pdf417",
  "qr_code", "upc_a", "upc_e",
];

function isBarcodeDetectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

export function CameraScannerModal({ open, onClose, onScan }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number>(0);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const handleDetected = useCallback((rawValue: string) => {
    const now = Date.now();
    // Debounce: ignore the same value for 2 s to prevent duplicate triggers
    if (rawValue === lastScannedRef.current && now - lastScannedAtRef.current < 2000) return;
    lastScannedRef.current = rawValue;
    lastScannedAtRef.current = now;

    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 600);

    // Brief delay so the flash is visible before closing
    setTimeout(() => {
      stopCamera();
      onScan(rawValue);
      onClose();
    }, 300);
  }, [onScan, onClose, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Build detector with all supported formats
      let formats = ALL_FORMATS;
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported.length > 0) formats = supported;
      } catch {}
      detectorRef.current = new BarcodeDetector({ formats });

      setScanning(true);

      const scan = async () => {
        if (!videoRef.current || !detectorRef.current || !streamRef.current) return;
        if (videoRef.current.readyState >= 2) {
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            if (results.length > 0 && results[0].rawValue) {
              handleDetected(results[0].rawValue);
              return;
            }
          } catch {}
        }
        rafRef.current = requestAnimationFrame(scan);
      };

      rafRef.current = requestAnimationFrame(scan);
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access and try again."
          : err?.name === "NotFoundError"
          ? "No camera found on this device."
          : "Could not access the camera. Please try again.";
      setCameraError(msg);
    }
  }, [handleDetected]);

  // Start / stop camera when the modal opens / closes
  useEffect(() => {
    if (!open) {
      stopCamera();
      setManualInput("");
      setCameraError(null);
      lastScannedRef.current = null;
      return;
    }
    const isSupported = isBarcodeDetectorSupported();
    setSupported(isSupported);
    if (isSupported) startCamera();
  }, [open, startCamera, stopCamera]);

  // Clean up on unmount
  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleManualSubmit = () => {
    const value = manualInput.trim();
    if (!value) return;
    stopCamera();
    onScan(value);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { stopCamera(); onClose(); } }}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Camera className="h-4 w-4 text-primary" />
              Scan Barcode / QR Code
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Camera viewport */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          {supported === false ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Camera barcode scanning isn't supported in this browser.
                Use a USB/Bluetooth scanner or type the barcode below.
              </p>
            </div>
          ) : cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive">{cameraError}</p>
              <Button size="sm" variant="outline" onClick={startCamera} data-testid="button-retry-camera">
                Retry
              </Button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                data-testid="video-camera-preview"
              />

              {/* Viewfinder overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* Dim border */}
                <div className="absolute inset-0 bg-black/40" />

                {/* Clear scanning window */}
                <div
                  className="relative z-10 rounded-lg"
                  style={{ width: "70%", height: "45%" }}
                >
                  {/* Corner brackets */}
                  <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-sm" />
                  <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-sm" />
                  <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-sm" />
                  <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-sm" />

                  {/* Scan line animation */}
                  {scanning && !flashActive && (
                    <ScanLine className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-5 w-5/6 text-primary opacity-80 animate-bounce" />
                  )}

                  {/* Flash confirmation */}
                  {flashActive && (
                    <div className="absolute inset-0 bg-primary/30 rounded-lg transition-opacity" />
                  )}
                </div>

                {/* Hint text */}
                <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70 z-10">
                  {scanning ? "Point camera at barcode or QR code" : "Starting camera…"}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Manual fallback input */}
        <div className="px-5 py-4 border-t border-border/40">
          <p className="text-xs text-muted-foreground mb-2">Or type / paste a barcode manually:</p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter barcode…"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleManualSubmit()}
              className="h-9 text-sm"
              data-testid="input-camera-manual-barcode"
            />
            <Button
              size="sm"
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              data-testid="button-camera-manual-submit"
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
