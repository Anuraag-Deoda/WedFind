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
        className="p-3 sm:p-5"
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
        {/* Close button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-warm-100 hover:bg-warm-200 flex items-center justify-center transition-colors"
            aria-label="Close preview"
          >
            <svg className="w-4 h-4 text-warm-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Image */}
        <div className="relative rounded-2xl overflow-hidden bg-warm-50 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={image.original_filename}
            className="w-full max-h-[60vh] object-contain"
          />

          {/* Nav arrows */}
          {hasPrev && (
            <button
              onClick={onPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm text-warm-700 rounded-full p-2.5 hover:bg-white shadow-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-100"
              aria-label="Previous image"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          {hasNext && (
            <button
              onClick={onNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm text-warm-700 rounded-full p-2.5 hover:bg-white shadow-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-100"
              aria-label="Next image"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-warm-400 truncate">
            {image.original_filename}
          </p>
          <div className="flex gap-2 shrink-0">
            {onNotMe && (
              <Button variant="ghost" size="sm" onClick={handleNotMe}>
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Not Me
              </Button>
            )}
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button variant="ghost" size="sm" onClick={handleShare}>
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                </svg>
                Share
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleDownload}>
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
