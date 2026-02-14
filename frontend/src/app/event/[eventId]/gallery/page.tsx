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
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <Link
            href={`/event/${eventId}`}
            className="text-sm text-warm-500 hover:text-warm-700 mb-1 inline-block"
          >
            &larr; Back to event
          </Link>
          <h1 className="text-2xl font-bold text-warm-900">All Photos</h1>
          <p className="text-warm-500">{images.length} photos</p>
        </div>

        <ImageGrid
          images={images}
          eventId={eventId}
          onImageClick={setPreviewImage}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />

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
  );
}
