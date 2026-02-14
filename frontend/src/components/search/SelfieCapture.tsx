"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface SelfieCaptureProps {
  onCapture: (blob: Blob) => void;
}

export function SelfieCapture({ onCapture }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });
      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
          ? "Camera access denied. Please allow camera permission in your browser settings."
          : "Could not access camera. Please use file upload instead.";
      setError(msg);
      setStarting(false);
    }
  }, []);

  const handlePlaying = useCallback(() => {
    setReady(true);
    setStarting(false);
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setFlash(true);
    setTimeout(() => setFlash(false), 200);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          stopCamera();
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.92
    );
  }, [onCapture, stopCamera]);

  const captureWithCountdown = useCallback(() => {
    setCountdown(3);
    let count = 3;
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        capture();
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [capture]);

  // Auto-start camera on mount
  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="text-center p-8 bg-warm-50 rounded-2xl border border-warm-100">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warm-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-warm-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
        </div>
        <p className="text-sm text-warm-600 mb-4">{error}</p>
        <Button variant="secondary" size="sm" onClick={startCamera}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-warm-900 aspect-[4/3]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPlaying={handlePlaying}
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {(starting || !ready) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-warm-900">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-3" />
            <p className="text-white/60 text-sm">Starting camera...</p>
          </div>
        )}

        {flash && (
          <div className="absolute inset-0 bg-white pointer-events-none" style={{ animation: "fadeOut 0.2s ease-out forwards" }} />
        )}

        {ready && countdown === null && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-2 border-white/25 rounded-full" />
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <p className="text-white/70 text-xs bg-black/30 inline-block px-3 py-1 rounded-full backdrop-blur-sm">
                Position your face in the oval
              </p>
            </div>
          </div>
        )}

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="text-7xl font-bold text-white drop-shadow-lg animate-pulse">
              {countdown}
            </span>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {ready && (
        <div className="flex gap-3 justify-center">
          <Button onClick={capture} size="lg" className="flex-1 max-w-[200px]">
            Capture
          </Button>
          <Button variant="secondary" size="lg" onClick={captureWithCountdown}>
            3s Timer
          </Button>
        </div>
      )}
    </div>
  );
}
