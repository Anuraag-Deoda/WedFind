"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ImageRecord, MatchDetails } from "@/types";

interface ImageGridProps {
  images: ImageRecord[];
  eventId: string;
  onImageClick?: (image: ImageRecord) => void;
  showConfidence?: boolean;
  confidenceMap?: Map<string, number>;
  matchDetailsMap?: Map<string, MatchDetails>;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function ImageGrid({
  images,
  eventId,
  onImageClick,
  showConfidence,
  confidenceMap,
  matchDetailsMap,
  hasMore,
  onLoadMore,
}: ImageGridProps) {
  const observerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore || !observerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" }
    );

    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (images.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-warm-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-warm-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </div>
        <p className="text-warm-500 font-medium">No photos yet</p>
        <p className="text-sm text-warm-400 mt-1">Photos will appear here once uploaded</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {images.map((image) => (
          <GridItem
            key={image.id}
            image={image}
            eventId={eventId}
            onClick={onImageClick}
            confidence={showConfidence ? confidenceMap?.get(image.id) : undefined}
            matchDetails={matchDetailsMap?.get(image.id)}
          />
        ))}
      </div>
      {hasMore && <div ref={observerRef} className="h-8" />}
    </div>
  );
}

function GridItem({
  image,
  eventId,
  onClick,
  confidence,
  matchDetails,
}: {
  image: ImageRecord;
  eventId: string;
  onClick?: (image: ImageRecord) => void;
  confidence?: number;
  matchDetails?: MatchDetails;
}) {
  const [loaded, setLoaded] = useState(false);
  const thumbnailUrl = image.thumbnail_filename
    ? `/new-app/api/events/${eventId}/thumbnail/${image.thumbnail_filename}`
    : `/new-app/api/events/${eventId}/file/${image.stored_filename}`;

  const badgeStyle =
    confidence !== undefined
      ? confidence >= 0.85
        ? "bg-sage/90 text-white"
        : confidence >= 0.70
          ? "bg-gold/90 text-white"
          : "bg-warm-500/80 text-white"
      : "";

  return (
    <div
      className="relative group aspect-square rounded-2xl overflow-hidden bg-warm-100 cursor-pointer shadow-sm hover:shadow-lg transition-all duration-300"
      onClick={() => onClick?.(image)}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-gradient-to-br from-warm-100 to-warm-200 shimmer-bg" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt={image.original_filename}
        className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-[1.06] ${loaded ? "opacity-100" : "opacity-0"}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Confidence badge */}
      {confidence !== undefined && (
        <div className={`absolute top-2.5 right-2.5 ${badgeStyle} text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-md shadow-sm`}>
          {Math.round(confidence * 100)}%
        </div>
      )}

      {/* Match quality indicators on hover */}
      {matchDetails && (
        <div className="absolute bottom-0 left-0 right-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="flex gap-1 flex-wrap">
            {matchDetails.is_frontal && (
              <span className="bg-white/90 backdrop-blur-sm text-warm-800 text-[10px] font-medium px-2 py-0.5 rounded-full">
                Frontal
              </span>
            )}
            {matchDetails.scene_type && (
              <span className="bg-white/90 backdrop-blur-sm text-warm-800 text-[10px] font-medium px-2 py-0.5 rounded-full">
                {matchDetails.scene_type.replace("_", " ")}
              </span>
            )}
            {matchDetails.face_quality !== null && matchDetails.face_quality > 0.7 && (
              <span className="bg-sage/90 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                HQ
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
