/**
 * CameraScannerModal — two scanning modes:
 *
 * 1. LIVE viewfinder (getUserMedia + BarcodeDetector)
 * 2. PHOTO fallback (<input capture="environment">) — works even when the
 *    browser blocks getUserMedia, because it opens the OS camera app directly.
 *
 * IMPORTANT: We do NOT pre-check navigator.permissions.query before trying.
 * Chrome sometimes returns "denied" even right after a user clears site data,
 * which would block us from ever asking. Instead we always show the button,
 * let the click be the user gesture, and only show the error if it actually fails.
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

type CameraState = "idle" | "starting" | "active" | "denied" | "error" | "unsupported";
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

  // Called directly from a button click — guarantees the user gesture Chrome needs
  const startCamera = useCallback(async () => {
    setCameraState("starting");
    setCameraError(null);
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
    } catch (err: unknown) {
      stopCamera();
      if ((err as { name?: string })?.name === "NotAllowedError") {
        setCameraState("denied");
      } else {
        setCameraError((err as { name?: string })?.name === "NotFoundError" ? "No camera found on this device." : "Could not start the camera.");
        setCameraState("error");
      }
    }
  }, [handleDetected, stopCamera]);

  // Reset when modal opens/closes — no permission pre-check
  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraState("idle");
      setCameraError(null);
      setManualInput("");
      setFlashActive(false);
      setPhotoState("idle");
      lastScannedRef.current = null;
      return;
    }
    if (!isBarcodeDetectorSupported()) {
      setCameraState("unsupported");
    } else {
      setCameraState("idle"); // always start here — let the button click trigger getUserMedia
    }
  }, [open, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Photo fallback — uses OS camera app, bypasses browser camera permission ──
  const triggerPhotoCapture = () => {
    setPhotoState("scanning"); // set before click so UI updates immediately
    photoInputRef.current?.click();
  };

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) { setPhotoState("idle"); return; }
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

  const PhotoButton = ({ label = "Take a Photo to Scan", variant = "secondary" as "secondary" | "default" }) => (
    <Button
      variant={variant}
      onClick={triggerPhotoCapture}
      disabled={photoState === "scanning"}
      data-testid="button-take-photo"
      className="gap-2 w-full"
    >
      {photoState === "scanning"
        ? <>Scanning photo…</>
        : <><ImageIcon className="h-4 w-4" /> {label}</>
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

        {/* Hidden native-camera file input */}
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

          {/* Live viewfinder overlay */}
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

          {/* Idle — always start here, let the tap be the user gesture */}
          {cameraState === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Scan a barcode</p>
                <p className="text-xs text-white/50 mt-0.5">Choose an option below</p>
              </div>

              {/* Primary: live camera */}
              <Button onClick={startCamera} className="w-full max-w-xs rounded-xl" data-testid="button-start-camera">
                <Camera className="h-4 w-4 mr-2" /> Start Live Camera
              </Button>

              <div className="flex items-center gap-2 w-full max-w-xs">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] text-white/30 uppercase tracking-wide">or</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Secondary: photo */}
              <div className="w-full max-w-xs">
                <PhotoButton label="Take a Photo to Scan" variant="secondary" />
                <p className="text-[10px] text-white/30 mt-1.5">
                  Opens your camera app · no browser permission needed
                </p>
              </div>

              {photoState === "no-result" && (
                <p className="text-xs text-amber-400 max-w-xs">No barcode found in that photo. Try better lighting or hold the camera closer.</p>
              )}
              {photoState === "error" && (
                <p className="text-xs text-destructive max-w-xs">Couldn't read the photo. Please try again.</p>
              )}
            </div>
          )}

          {/* Starting */}
          {cameraState === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-xs text-white/60">Starting camera…</p>
            </div>
          )}

          {/* Denied — camera blocked, photo fallback is the main CTA */}
          {cameraState === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center overflow-y-auto">
              <CameraOff className="h-7 w-7 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">Camera blocked</p>
                <p className="text-xs text-white/50 mt-0.5">Chrome denied camera access for this site</p>
              </div>

              {/* Photo fallback — most prominent */}
              <div className="w-full max-w-xs bg-primary/10 border border-primary/20 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-semibold text-white">Use your phone camera instead:</p>
                <PhotoButton label="Take a Photo to Scan" />
                <p className="text-[11px] text-white/40">
                  Tap → your camera app opens → take a photo of the barcode → done.
                  No Chrome settings needed.
                </p>
                {photoState === "no-result" && (
                  <p className="text-xs text-amber-400">No barcode found. Try better lighting or hold closer.</p>
                )}
                {photoState === "error" && (
                  <p className="text-xs text-destructive">Couldn't read the photo. Try again.</p>
                )}
              </div>

              {/* Chrome fix — collapsed by default */}
              <details className="w-full max-w-xs text-left">
                <summary className="text-[11px] text-white/35 cursor-pointer select-none text-center py-1">
                  Fix Chrome's camera permission instead ›
                </summary>
                <div className="mt-2 text-xs text-white/60 bg-white/5 rounded-xl p-3 space-y-1.5">
                  <p><strong className="text-white">Via Chrome menu (⋮):</strong></p>
                  <ol className="space-y-1 list-none">
                    <li>1. Settings → Site settings → Camera</li>
                    <li>2. Find <strong className="text-white">artixpos.com</strong> → Allow</li>
                    <li>3. Return here → tap "Try Live Camera"</li>
                  </ol>
                </div>
              </details>

              <Button size="sm" variant="outline" onClick={startCamera} data-testid="button-retry-camera">
                Try Live Camera
              </Button>
            </div>
          )}

          {/* Other error */}
          {cameraState === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive leading-snug">{cameraError}</p>
              <div className="w-full max-w-xs space-y-2">
                <PhotoButton label="Take a Photo Instead" />
              </div>
              <Button size="sm" variant="outline" onClick={startCamera} data-testid="button-retry-camera">Try Again</Button>
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
