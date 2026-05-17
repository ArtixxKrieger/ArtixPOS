/**
 * CameraScannerModal — uses the device camera + native BarcodeDetector API
 * to scan barcodes and QR codes. Falls back gracefully on unsupported browsers.
 *
 * Permission flow:
 *   - "granted"  → auto-starts camera immediately (no extra tap needed)
 *   - "prompt"   → shows "Start Camera" tap button (required for Android Chrome
 *                  to associate getUserMedia with a real user gesture)
 *   - "denied"   → shows site-settings instructions right away (no spinner)
 *
 * Supported in Chrome 83+ on Android and Chrome 88+ on desktop.
 * Safari / Firefox show a "not supported" message and prompt manual entry.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, ScanLine, ExternalLink } from "lucide-react";

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

async function queryCameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const result = await navigator.permissions.query({ name: "camera" as PermissionName });
    return result.state;
  } catch {
    return "unknown";
  }
}

type CameraState = "checking" | "idle" | "starting" | "active" | "error" | "unsupported";

export function CameraScannerModal({ open, onClose, onScan }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number>(0);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPermDenied, setIsPermDenied] = useState(false);
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
  }, []);

  const startCamera = useCallback(async () => {
    setCameraState("starting");
    setCameraError(null);
    setIsPermDenied(false);
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

      let formats = ALL_FORMATS;
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        if (supported.length > 0) formats = supported;
      } catch {}
      detectorRef.current = new BarcodeDetector({ formats });

      setCameraState("active");

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
      stopCamera();
      if (err?.name === "NotAllowedError") {
        setIsPermDenied(true);
        setCameraState("error");
      } else {
        const msg =
          err?.name === "NotFoundError"
            ? "No camera found on this device."
            : "Could not access the camera. Please try again.";
        setCameraError(msg);
        setCameraState("error");
      }
    }
  }, [stopCamera]); // handleDetected added below via ref trick

  const handleDetected = useCallback((rawValue: string) => {
    const now = Date.now();
    if (rawValue === lastScannedRef.current && now - lastScannedAtRef.current < 2000) return;
    lastScannedRef.current = rawValue;
    lastScannedAtRef.current = now;
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 600);
    setTimeout(() => {
      stopCamera();
      onScan(rawValue);
      onClose();
    }, 300);
  }, [onScan, onClose, stopCamera]);

  // Patch handleDetected into startCamera's closure via ref
  const handleDetectedRef = useRef(handleDetected);
  useEffect(() => { handleDetectedRef.current = handleDetected; }, [handleDetected]);

  // When modal opens: check permission state and react accordingly
  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraState("idle");
      setCameraError(null);
      setIsPermDenied(false);
      setManualInput("");
      setFlashActive(false);
      lastScannedRef.current = null;
      return;
    }

    if (!isBarcodeDetectorSupported()) {
      setCameraState("unsupported");
      return;
    }

    // Check existing permission state — do NOT call getUserMedia here
    setCameraState("checking");
    queryCameraPermission().then(state => {
      if (state === "granted") {
        // Already permitted — auto-start without requiring an extra tap
        startCamera();
      } else if (state === "denied") {
        setIsPermDenied(true);
        setCameraState("error");
      } else {
        // "prompt" or "unknown" — show the tap button so the click IS the user gesture
        setCameraState("idle");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Camera className="h-4 w-4 text-primary" />
            Scan Barcode / QR Code
          </DialogTitle>
        </DialogHeader>

        {/* Camera viewport */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>

          {/* Always-mounted video so the ref is available when startCamera runs */}
          <video
            ref={videoRef}
            className={[
              "w-full h-full object-cover",
              cameraState === "active" ? "block" : "hidden",
            ].join(" ")}
            playsInline
            muted
            data-testid="video-camera-preview"
          />

          {/* Viewfinder overlay — shown only while active */}
          {cameraState === "active" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 rounded-lg" style={{ width: "70%", height: "45%" }}>
                <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-sm" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-sm" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-sm" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-sm" />
                {!flashActive && (
                  <ScanLine className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-5 w-5/6 text-primary opacity-80 animate-bounce" />
                )}
                {flashActive && (
                  <div className="absolute inset-0 bg-primary/30 rounded-lg" />
                )}
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70 z-10">
                Point camera at barcode or QR code
              </p>
            </div>
          )}

          {/* Checking permission */}
          {cameraState === "checking" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-white/60">Checking camera access…</p>
            </div>
          )}

          {/* Idle — need user tap to fire the permission prompt */}
          {cameraState === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-white mb-1">Ready to scan</p>
                <p className="text-xs text-white/50">Tap the button below — your browser will ask for camera access</p>
              </div>
              <Button
                onClick={startCamera}
                className="rounded-xl px-6"
                data-testid="button-start-camera"
              >
                Start Camera
              </Button>
            </div>
          )}

          {/* Starting */}
          {cameraState === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-white/60">Starting camera…</p>
            </div>
          )}

          {/* Error — permission denied */}
          {cameraState === "error" && isPermDenied && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center overflow-y-auto">
              <CameraOff className="h-10 w-10 text-destructive shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">Camera blocked for this site</p>
                <p className="text-xs text-white/60 leading-relaxed">
                  Chrome has two permission layers. Your phone already allows Chrome to use the camera, but <strong className="text-white">Chrome is blocking this specific website.</strong> Fix it in Chrome's own settings:
                </p>
              </div>
              <div className="text-left text-xs text-white/70 space-y-2 w-full max-w-xs bg-white/5 rounded-xl p-3">
                <p className="font-semibold text-white/90 text-[11px] uppercase tracking-wide">Option A — from this page</p>
                <ol className="space-y-1.5">
                  <li className="flex gap-2"><span className="text-primary font-bold shrink-0">1.</span>Tap the <strong className="text-white">⋮</strong> menu (top-right of Chrome)</li>
                  <li className="flex gap-2"><span className="text-primary font-bold shrink-0">2.</span>Tap <strong className="text-white">Settings → Site settings → Camera</strong></li>
                  <li className="flex gap-2"><span className="text-primary font-bold shrink-0">3.</span>Find <strong className="text-white">artixpos.com</strong> and set it to <strong className="text-white">Allow</strong></li>
                </ol>
                <p className="font-semibold text-white/90 text-[11px] uppercase tracking-wide pt-1">Option B — tap the address bar</p>
                <ol className="space-y-1.5">
                  <li className="flex gap-2"><span className="text-primary font-bold shrink-0">1.</span>Tap the address bar at the top of Chrome</li>
                  <li className="flex gap-2"><span className="text-primary font-bold shrink-0">2.</span>Look for a <strong className="text-white">lock 🔒 or info ⓘ icon</strong> beside the URL</li>
                  <li className="flex gap-2"><span className="text-primary font-bold shrink-0">3.</span>Tap it → <strong className="text-white">Permissions → Camera → Allow</strong></li>
                </ol>
              </div>
              <p className="text-[11px] text-white/40">After changing the setting, come back and tap Try Again.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={startCamera}
                data-testid="button-retry-camera"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Error — other */}
          {cameraState === "error" && !isPermDenied && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive leading-snug">{cameraError}</p>
              <Button size="sm" variant="outline" onClick={startCamera} data-testid="button-retry-camera">
                Try Again
              </Button>
            </div>
          )}

          {/* Unsupported browser */}
          {cameraState === "unsupported" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Camera scanning isn't supported in this browser. Use a USB/Bluetooth scanner or type the barcode below.
              </p>
            </div>
          )}
        </div>

        {/* Manual fallback */}
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
