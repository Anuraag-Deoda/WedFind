"use client";

import { useEffect, useState, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { ImageRecord } from "@/types";

interface ImagePreviewProps {
  image: ImageRecord | null;
  eventId: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onNotMe?: (imageId: string) => void;
}

export function ImagePreview({
  image,
  eventId,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onNotMe,
}: ImagePreviewProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) onPrev?.();
      if (e.key === "ArrowRight" && hasNext) onNext?.();
    },
    [hasPrev, hasNext, onPrev, onNext]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!image) return null;

  const imageUrl = `/new-app/api/events/${eventId}/file/${image.stored_filename}`;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = image.original_filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        const file = new File([blob], image.original_filename, {
          type: blob.type,
        });
        await navigator.share({ files: [file] });
      } catch {
        // User cancelled or share failed
      }
    }
  };

  const handleNotMe = () => {
    if (onNotMe) {
      onNotMe(image.id);
      // Move to next image if available, otherwise close
      if (hasNext) {
        onNext?.();
      } else if (hasPrev) {
        onPrev?.();
      } else {
        onClose();
      }
    }
  };

  return (
    <Modal open={!!image} onClose={onClose}>
      <div
        className="p-4"
        onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart === null) return;
          const diff = e.changedTouches[0].clientX - touchStart;
          if (Math.abs(diff) > 50) {
            if (diff > 0 && hasPrev) onPrev?.();
            if (diff < 0 && hasNext) onNext?.();
          }
          setTouchStart(null);
        }}
      >
        <div className="relative rounded-xl overflow-hidden bg-warm-100 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={image.original_filename}
            className="w-full max-h-[60vh] object-contain"
          />

          {hasPrev && (
            <button
              onClick={onPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 hover:bg-black/60"
              aria-label="Previous image"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}
          {hasNext && (
            <button
              onClick={onNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-2 hover:bg-black/60"
              aria-label="Next image"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-warm-500 truncate mr-4">
            {image.original_filename}
          </p>
          <div className="flex gap-2 shrink-0">
            {onNotMe && (
              <Button variant="ghost" size="sm" onClick={handleNotMe}>
                Not Me
              </Button>
            )}
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button variant="ghost" size="sm" onClick={handleShare}>
                Share
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              Download
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
