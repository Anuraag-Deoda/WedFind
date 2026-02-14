"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface SelfieCaptureProps {
  onCapture: (blob: Blob) => void;
}

export function SelfieCapture({ onCapture }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setReady(true);
      setError(null);
    } catch {
      setError("Could not access camera. Please allow camera access or use file upload instead.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setReady(false);
    }
  }, [stream]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror the image (front camera is mirrored)
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
      0.9
    );
  }, [onCapture, stopCamera]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  if (error) {
    return (
      <div className="text-center p-6 bg-warm-50 rounded-xl border border-warm-100">
        <p className="text-sm text-warm-600 mb-3">{error}</p>
        <Button variant="secondary" size="sm" onClick={startCamera}>
          Try Again
        </Button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="text-center p-8">
        <Button onClick={startCamera} size="lg">
          Open Camera
        </Button>
        <p className="text-sm text-warm-500 mt-3">
          Take a selfie to find your photos
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full max-h-[400px] object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        <div className="absolute inset-0 border-4 border-white/20 rounded-2xl pointer-events-none" />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex gap-3 justify-center">
        <Button onClick={capture} size="lg">
          Take Selfie
        </Button>
        <Button variant="ghost" onClick={stopCamera}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
