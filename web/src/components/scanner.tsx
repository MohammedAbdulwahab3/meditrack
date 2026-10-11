"use client";

import { CameraOff, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cn } from "./ui";

type ScannerHandle = { stop: () => void; destroy: () => void };

/**
 * Camera QR scanner. Calls onScan with the decoded text; the parent decides what to do.
 * When `paused` is true the camera stays off (e.g. while a result is shown).
 */
export function Scanner({
  onScan,
  paused,
  className,
}: {
  onScan: (text: string) => void;
  paused?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [state, setState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!enabled || paused || !videoRef.current) return;
    let scanner: ScannerHandle | null = null;
    let cancelled = false;
    let lastText = "";
    let lastAt = 0;
    setState("starting");
    (async () => {
      try {
        const QrScanner = (await import("qr-scanner")).default;
        if (cancelled || !videoRef.current) return;
        const s = new QrScanner(
          videoRef.current,
          (result) => {
            // Debounce repeated reads of the same code.
            const now = Date.now();
            if (result.data === lastText && now - lastAt < 2500) return;
            lastText = result.data;
            lastAt = now;
            onScanRef.current(result.data);
          },
          { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 6 },
        );
        scanner = s;
        await s.start();
        if (cancelled) {
          s.stop();
          s.destroy();
          return;
        }
        setState("running");
      } catch (e) {
        if (cancelled) return;
        setState("error");
        const msg = String(e);
        setError(
          /NotAllowed|Permission/i.test(msg)
            ? "Camera permission was denied. Allow camera access in your browser settings, or type the code below."
            : /NotFound|no camera/i.test(msg)
              ? "No camera found on this device. Type the code printed under the QR instead."
              : "Couldn't start the camera. Type the code printed under the QR instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      scanner?.stop();
      scanner?.destroy();
    };
  }, [enabled, paused]);

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-900", className)}>
      <video ref={videoRef} className={cn("h-full w-full object-cover", (!enabled || state === "error") && "hidden")} muted playsInline />
      {!enabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-slate-300">
          <ScanLine className="size-12 text-brand-300" />
          <p className="text-sm">Point your camera at the QR code on the pack.</p>
          <Button onClick={() => setEnabled(true)} size="lg">
            Start camera
          </Button>
        </div>
      )}
      {enabled && state === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">Starting camera…</div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-200">
          <CameraOff className="size-10 text-slate-400" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
