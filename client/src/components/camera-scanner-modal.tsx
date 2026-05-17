/**
 * CameraScannerModal — two scanning modes:
 *
 * 1. LIVE viewfinder (getUserMedia + BarcodeDetector) — best experience.
 *    Permission flow:
 *      "granted"  → auto-starts immediately
 *      "prompt"   → shows "Start Camera" tap so Chrome gets a real user gesture
 *      "denied"   → shows fix instructions + offers Photo fallback
 *
 * 2. PHOTO fallback (<input capture="environment">) — always works even when
 *    the site-level camera permission is blocked, because it opens the OS
 *    camera app instead of the browser's getUserMedia API.
 *    Requires BarcodeDetector to read the captured image.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, ScanLine, ImageIcon, RefreshCw } from "lucide-react";

interface CameraScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
}

declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement): Promise<Array<{ rawValue: string; format: string }>>;
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
type PhotoState = "idle" | "scanning" | "no-result" | "error";

export function CameraScannerModal({ open, onClose, onScan }: CameraScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number>(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isPermDenied, setIsPermDenied] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [photoState, setPhotoState] = useState<PhotoState>("idle");

  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  }, []);

  const handleDetected = useCallback((rawValue: string) => {
    const now = Date.now();
    if (rawValue === lastScannedRef.current && now - lastScannedAtRef.current < 2000) return;
    lastScannedRef.current = rawValue;
    lastScannedAtRef.current = now;
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 600);
    setTimeout(() => { stopCamera(); onScan(rawValue); onClose(); }, 300);
  }, [onScan, onClose, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraState("starting");
    setCameraError(null);
    setIsPermDenied(false);
    setPhotoState("idle");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }

      let formats = ALL_FORMATS;
      try { const s = await BarcodeDetector.getSupportedFormats(); if (s.length > 0) formats = s; } catch {}
      detectorRef.current = new BarcodeDetector({ formats });
      setCameraState("active");

      const scan = async () => {
        if (!videoRef.current || !detectorRef.current || !streamRef.current) return;
        if (videoRef.current.readyState >= 2) {
          try {
            const results = await detectorRef.current.detect(videoRef.current);
            if (results.length > 0 && results[0].rawValue) { handleDetected(results[0].rawValue); return; }
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
        setCameraError(err?.name === "NotFoundError" ? "No camera found on this device." : "Could not access the camera.");
        setCameraState("error");
      }
    }
  }, [handleDetected, stopCamera]);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraState("idle");
      setCameraError(null);
      setIsPermDenied(false);
      setManualInput("");
      setFlashActive(false);
      setPhotoState("idle");
      lastScannedRef.current = null;
      return;
    }
    if (!isBarcodeDetectorSupported()) { setCameraState("unsupported"); return; }
    setCameraState("checking");
    queryCameraPermission().then(state => {
      if (state === "granted") startCamera();
      else if (state === "denied") { setIsPermDenied(true); setCameraState("error"); }
      else setCameraState("idle");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Photo fallback ──────────────────────────────────────────────────────────
  const triggerPhotoCapture = () => {
    setPhotoState("idle");
    photoInputRef.current?.click();
  };

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be picked again
    if (!file) return;
    setPhotoState("scanning");
    try {
      const bitmap = await createImageBitmap(file);
      let formats = ALL_FORMATS;
      try { const s = await BarcodeDetector.getSupportedFormats(); if (s.length > 0) formats = s; } catch {}
      const detector = new BarcodeDetector({ formats });
      const results = await detector.detect(bitmap);
      bitmap.close();
      if (results.length > 0 && results[0].rawValue) {
        onScan(results[0].rawValue);
        onClose();
      } else {
        setPhotoState("no-result");
      }
    } catch {
      setPhotoState("error");
    }
  };

  const handleManualSubmit = () => {
    const value = manualInput.trim();
    if (!value) return;
    stopCamera();
    onScan(value);
    onClose();
  };

  // Shared "Take Photo" button used in multiple states
  const TakePhotoButton = ({ label = "Take Photo Instead", size = "sm" as "sm" | "default" }) => (
    <Button
      size={size}
      variant="secondary"
      onClick={triggerPhotoCapture}
      disabled={photoState === "scanning"}
      data-testid="button-take-photo"
      className="gap-2"
    >
      {photoState === "scanning"
        ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Scanning photo…</>
        : <><ImageIcon className="h-3.5 w-3.5" />{label}</>
      }
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { stopCamera(); onClose(); } }}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Camera className="h-4 w-4 text-primary" />
            Scan Barcode / QR Code
          </DialogTitle>
        </DialogHeader>

        {/* Hidden native camera file input — bypasses site-level permissions */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoFile}
          data-testid="input-photo-capture"
        />

        {/* Camera viewport */}
        <div className="relative bg-black" style={{ aspectRatio: "4/3" }}>
          <video
            ref={videoRef}
            className={["w-full h-full object-cover", cameraState === "active" ? "block" : "hidden"].join(" ")}
            playsInline muted
            data-testid="video-camera-preview"
          />

          {/* Viewfinder overlay */}
          {cameraState === "active" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 rounded-lg" style={{ width: "70%", height: "45%" }}>
                <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white rounded-tl-sm" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white rounded-tr-sm" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white rounded-bl-sm" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white rounded-br-sm" />
                {!flashActive
                  ? <ScanLine className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto h-5 w-5/6 text-primary opacity-80 animate-bounce" />
                  : <div className="absolute inset-0 bg-primary/30 rounded-lg" />
                }
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/70 z-10">
                Point camera at barcode or QR code
              </p>
            </div>
          )}

          {/* Checking */}
          {cameraState === "checking" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-white/60">Checking camera access…</p>
            </div>
          )}

          {/* Idle — first-time permission prompt needs user tap */}
          {cameraState === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-white mb-1">Ready to scan</p>
                <p className="text-xs text-white/50">Chrome will ask for camera permission</p>
              </div>
              <Button onClick={startCamera} className="rounded-xl px-6" data-testid="button-start-camera">
                Start Live Camera
              </Button>
              <div className="flex items-center gap-2 w-full max-w-xs">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-white/30 uppercase tracking-wide">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <TakePhotoButton label="Take a Photo to Scan" size="default" />
              {photoState === "no-result" && (
                <p className="text-xs text-amber-400">No barcode found in that photo. Try again with better lighting.</p>
              )}
              {photoState === "error" && (
                <p className="text-xs text-destructive">Could not read the photo. Please try again.</p>
              )}
            </div>
          )}

          {/* Starting */}
          {cameraState === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-white/60">Starting camera…</p>
            </div>
          )}

          {/* Error — permission denied — show photo fallback prominently */}
          {cameraState === "error" && isPermDenied && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center overflow-y-auto">
              <CameraOff className="h-8 w-8 text-destructive shrink-0" />
              <p className="text-sm font-semibold text-destructive">Camera blocked for this site</p>

              {/* Photo fallback — most prominent option */}
              <div className="w-full max-w-xs bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-semibold text-white">Quickest fix — no settings needed:</p>
                <TakePhotoButton label="Take a Photo to Scan" size="default" />
                <p className="text-[11px] text-white/50">Opens your phone's camera app. Take a photo of the barcode and we'll read it automatically.</p>
                {photoState === "no-result" && (
                  <p className="text-xs text-amber-400">No barcode found. Try with better lighting or hold closer.</p>
                )}
                {photoState === "error" && (
                  <p className="text-xs text-destructive">Could not read the photo. Please try again.</p>
                )}
              </div>

              {/* Settings instructions as secondary option */}
              <details className="w-full max-w-xs text-left">
                <summary className="text-[11px] text-white/40 cursor-pointer select-none text-center">
                  Or fix Chrome's site permission ›
                </summary>
                <div className="mt-2 text-xs text-white/60 space-y-2 bg-white/5 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-white/80">Via Chrome menu:</p>
                  <ol className="space-y-1">
                    <li className="flex gap-2"><span className="text-primary font-bold shrink-0">1.</span>Tap <strong className="text-white">⋮</strong> → Settings → Site settings → Camera</li>
                    <li className="flex gap-2"><span className="text-primary font-bold shrink-0">2.</span>Find <strong className="text-white">artixpos.com</strong> → set to <strong className="text-white">Allow</strong></li>
                    <li className="flex gap-2"><span className="text-primary font-bold shrink-0">3.</span>Return here and tap <strong className="text-white">Try Again</strong></li>
                  </ol>
                </div>
              </details>
              <Button size="sm" variant="outline" onClick={startCamera} data-testid="button-retry-camera">
                Try Live Camera Again
              </Button>
            </div>
          )}

          {/* Error — other */}
          {cameraState === "error" && !isPermDenied && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive leading-snug">{cameraError}</p>
              <TakePhotoButton label="Take a Photo Instead" />
              <Button size="sm" variant="outline" onClick={startCamera} data-testid="button-retry-camera">
                Try Again
              </Button>
            </div>
          )}

          {/* Unsupported */}
          {cameraState === "unsupported" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Barcode scanning isn't supported in this browser. Type the barcode below or use a USB/Bluetooth scanner.
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
            <Button size="sm" onClick={handleManualSubmit} disabled={!manualInput.trim()} data-testid="button-camera-manual-submit">
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
