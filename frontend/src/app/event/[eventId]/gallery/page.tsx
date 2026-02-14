"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Spinner } from "@/components/ui/Spinner";
import { ImageGrid } from "@/components/gallery/ImageGrid";
import { ImagePreview } from "@/components/gallery/ImagePreview";
import { getEventImages } from "@/lib/api";
import type { ImageRecord } from "@/types";

export default function GalleryPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageRecord | null>(null);

  const loadImages = useCallback(
    async (pageNum: number) => {
      try {
        const data = await getEventImages(eventId, pageNum);
        if (pageNum === 1) {
          setImages(data.images);
        } else {
          setImages((prev) => [...prev, ...data.images]);
        }
        setHasMore(data.has_next);
      } catch {
        // handled silently
      } finally {
        setLoading(false);
      }
    },
    [eventId]
  );

  useEffect(() => {
    loadImages(1);
  }, [loadImages]);

  const loadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadImages(nextPage);
  }, [page, loadImages]);

  const currentIdx = previewImage
    ? images.findIndex((img) => img.id === previewImage.id)
    : -1;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-pink/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-sage/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-[250px] h-[250px] bg-gradient-purple/6 rounded-full blur-3xl" />
        <div className="absolute top-[15%] right-[10%] w-1.5 h-1.5 bg-gradient-purple/35 rounded-full animate-sparkle" />
        <div className="absolute bottom-[30%] left-[15%] w-1 h-1 bg-rose-accent/25 rounded-full animate-sparkle" style={{ animationDelay: "1.3s" }} />
      </div>

      <div className="relative z-10 py-8 sm:py-12 px-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="animate-fade-in">
            <Link
              href={`/event/${eventId}`}
              className="inline-flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 transition-colors mb-3"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </Link>
            <h1
              className="text-2xl sm:text-3xl font-bold text-warm-900 tracking-tight"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              All Photos
            </h1>
            <p className="text-warm-500 mt-1">{images.length} photos</p>
          </div>

          {/* Grid */}
          <div className="animate-fade-in">
            <ImageGrid
              images={images}
              eventId={eventId}
              onImageClick={setPreviewImage}
              hasMore={hasMore}
              onLoadMore={loadMore}
            />
          </div>

          <ImagePreview
            image={previewImage}
            eventId={eventId}
            onClose={() => setPreviewImage(null)}
            onPrev={
              currentIdx > 0
                ? () => setPreviewImage(images[currentIdx - 1])
                : undefined
            }
            onNext={
              currentIdx < images.length - 1
                ? () => setPreviewImage(images[currentIdx + 1])
                : undefined
            }
            hasPrev={currentIdx > 0}
            hasNext={currentIdx < images.length - 1}
          />
        </div>
      </div>
    </div>
  );
}
