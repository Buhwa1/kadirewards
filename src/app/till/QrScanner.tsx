"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Camera QR scan with zero dependencies: Chrome on Android ships BarcodeDetector,
 * which is exactly the device most counters have. Anywhere it's missing we say
 * so plainly and fall back to typing the code — no 300KB polyfill on a 3G line.
 */
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
    };
  }
}

export default function QrScanner({
  onResult,
  onClose,
}: {
  onResult: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    (async () => {
      if (!window.BarcodeDetector) {
        setError("This browser can't scan. Type the card code instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) return;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            if (codes.length > 0 && codes[0].rawValue) {
              onResult(codes[0].rawValue);
              return;
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Camera blocked. Allow camera access, or type the code.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#121110]">
      <div className="flex items-center justify-between px-5 py-4 text-[#f4f1ea]">
        <span className="text-sm font-medium">Scan the customer's card</span>
        <button onClick={onClose} className="min-h-10 rounded-lg bg-white/10 px-4 text-sm font-medium">
          Close
        </button>
      </div>
      <div className="relative flex-1">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-56 w-56 rounded-2xl border border-white/70" />
        </div>
      </div>
      {error && (
        <p className="bg-red-900 px-5 py-3 text-center text-sm font-medium text-red-50">{error}</p>
      )}
    </div>
  );
}
