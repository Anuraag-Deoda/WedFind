"use client";

import { useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SelfieCapture } from "@/components/search/SelfieCapture";
import { SelfieUpload } from "@/components/search/SelfieUpload";
import { useSearch } from "@/hooks/useSearch";
import { ImageGrid } from "@/components/gallery/ImageGrid";
import { ImagePreview } from "@/components/gallery/ImagePreview";
import { submitSearchFeedback } from "@/lib/api";
import type { ImageRecord, MatchDetails } from "@/types";

export default function FindPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const {
    search,
    searching,
    error,
    results,
    clearResults,
    selfieHash,
    feedbackApplied,
    hiddenIds,
    addHiddenId,
    clearHiddenIds,
  } = useSearch(eventId);
  const [mode, setMode] = useState<"choose" | "camera" | "upload">("choose");
  const [threshold, setThreshold] = useState(0.7);
  const [previewImage, setPreviewImage] = useState<ImageRecord | null>(null);
  const lastSelfieRef = useRef<Blob | null>(null);

  const handleSelfie = useCallback(
    async (blob: Blob) => {
      lastSelfieRef.current = blob;
      await search(blob, threshold);
    },
    [search, threshold]
  );

  const handleNotMe = useCallback(
    async (imageId: string) => {
      addHiddenId(imageId);
      if (selfieHash) {
        submitSearchFeedback(eventId, imageId, selfieHash).catch(() => {});
      }
    },
    [eventId, selfieHash, addHiddenId]
  );

  const handleResearch = useCallback(async () => {
    if (lastSelfieRef.current) {
      await search(lastSelfieRef.current, threshold);
    }
  }, [search, threshold]);

  const filteredResults = results?.results.filter(
    (r) => !hiddenIds.has(r.image.id)
  );

  const confidenceMap = new Map(
    results?.results.map((r) => [r.image.id, r.similarity])
  );

  const matchDetailsMap = new Map<string, MatchDetails>(
    results?.results
      .filter((r) => r.match_details)
      .map((r) => [r.image.id, r.match_details!])
  );

  if (results && filteredResults) {
    const images = filteredResults.map((r) => r.image);
    const currentIdx = previewImage
      ? images.findIndex((img) => img.id === previewImage.id)
      : -1;

    const feedbackCount =
      results.feedback_stats?.personal_feedback_count ?? 0;

    return (
      <ErrorBoundary>
        <div className="min-h-screen py-12 px-4">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Link
                  href={`/event/${eventId}`}
                  className="text-sm text-warm-500 hover:text-warm-700 mb-1 inline-block"
                  aria-label="Back to event"
                >
                  &larr; Back to event
                </Link>
                <h1 className="text-2xl font-bold text-warm-900">Your Photos</h1>
                <p className="text-warm-500" aria-live="polite">
                  Found {filteredResults.length} photo
                  {filteredResults.length !== 1 ? "s" : ""}
                  {hiddenIds.size > 0 && (
                    <span className="text-warm-400">
                      {" "}({hiddenIds.size} hidden)
                    </span>
                  )}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={clearResults}>
                Search Again
              </Button>
            </div>

            {feedbackApplied && feedbackCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <p className="text-sm text-green-700">
                  Results improved from {feedbackCount} &quot;Not Me&quot;{" "}
                  {feedbackCount === 1 ? "click" : "clicks"}
                </p>
              </div>
            )}

            <div className="flex items-center gap-4 p-4 bg-warm-50 rounded-xl border border-warm-100">
              <label
                htmlFor="threshold-slider"
                className="text-sm text-warm-600 shrink-0"
              >
                Sensitivity
              </label>
              <input
                id="threshold-slider"
                type="range"
                min="0.50"
                max="0.95"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="flex-1 accent-warm-600"
                aria-label="Match sensitivity threshold"
              />
              <span className="text-sm font-mono text-warm-700 w-12 text-right">
                {Math.round(threshold * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResearch}
                disabled={searching}
              >
                Re-search
              </Button>
            </div>

            <ImageGrid
              images={images}
              eventId={eventId}
              onImageClick={setPreviewImage}
              showConfidence
              confidenceMap={confidenceMap}
              matchDetailsMap={matchDetailsMap}
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
              onNotMe={handleNotMe}
            />

            {filteredResults.length === 0 && hiddenIds.size > 0 && (
              <div className="text-center py-8 space-y-3">
                <p className="text-warm-500">
                  All results hidden. Try lowering the sensitivity or searching
                  again.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearHiddenIds}
                >
                  Show All Results
                </Button>
              </div>
            )}

            {filteredResults.length > 0 && (
              <p className="text-center text-sm text-warm-400">
                See a photo that&apos;s not you? Click it and use &quot;Not
                Me&quot; to hide it.
              </p>
            )}
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen py-12 px-4">
        <div className="max-w-md mx-auto space-y-8">
          <div>
            <Link
              href={`/event/${eventId}`}
              className="text-sm text-warm-500 hover:text-warm-700 mb-1 inline-block"
              aria-label="Back to event"
            >
              &larr; Back to event
            </Link>
            <h1 className="text-2xl font-bold text-warm-900">Find My Photos</h1>
            <p className="text-warm-500 mt-1">
              Take a selfie or upload a photo of your face to find all photos
              you&apos;re in
            </p>
          </div>

          {searching ? (
            <div className="text-center py-12 space-y-4" role="status">
              <Spinner size="lg" className="mx-auto" />
              <p className="text-warm-500">Searching through event photos...</p>
            </div>
          ) : (
            <>
              {mode === "choose" && (
                <div className="space-y-3">
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={() => setMode("camera")}
                  >
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                      />
                    </svg>
                    Take a Selfie
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => setMode("upload")}
                  >
                    Upload a Photo
                  </Button>
                </div>
              )}

              {mode === "camera" && (
                <div className="space-y-4">
                  <SelfieCapture onCapture={handleSelfie} />
                  <button
                    onClick={() => setMode("choose")}
                    className="text-sm text-warm-500 hover:text-warm-700 block mx-auto"
                  >
                    Back to options
                  </button>
                </div>
              )}

              {mode === "upload" && (
                <div className="space-y-4">
                  <SelfieUpload onSelect={handleSelfie} />
                  <button
                    onClick={() => setMode("choose")}
                    className="text-sm text-warm-500 hover:text-warm-700 block mx-auto"
                  >
                    Back to options
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <div
              className="p-4 bg-red-50 border border-red-100 rounded-xl"
              role="alert"
            >
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
