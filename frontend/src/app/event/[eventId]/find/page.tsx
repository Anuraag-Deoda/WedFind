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

  // ── Results view ──────────────────────────────────────────────────
  if (results && filteredResults) {
    const images = filteredResults.map((r) => r.image);
    const currentIdx = previewImage
      ? images.findIndex((img) => img.id === previewImage.id)
      : -1;

    const feedbackCount =
      results.feedback_stats?.personal_feedback_count ?? 0;

    return (
      <ErrorBoundary>
        <div className="min-h-screen relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-gradient-pink/20 rounded-full blur-3xl" />
            <div className="absolute bottom-1/3 -left-32 w-[300px] h-[300px] bg-gradient-purple/8 rounded-full blur-3xl" />
            <div className="absolute top-[18%] right-[12%] w-1.5 h-1.5 bg-gradient-purple/40 rounded-full animate-sparkle" />
            <div className="absolute bottom-[20%] left-[18%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1.2s" }} />
          </div>

          <div className="relative z-10 py-8 sm:py-12 px-4">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 animate-fade-in">
                <div>
                  <Link
                    href={`/event/${eventId}`}
                    className="inline-flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 transition-colors mb-3"
                    aria-label="Back to event"
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
                    Your Photos
                  </h1>
                  <p className="text-warm-500 mt-1" aria-live="polite">
                    Found {filteredResults.length} photo
                    {filteredResults.length !== 1 ? "s" : ""}
                    {hiddenIds.size > 0 && (
                      <span className="text-warm-400">
                        {" "}· {hiddenIds.size} hidden
                      </span>
                    )}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={clearResults}>
                  New Search
                </Button>
              </div>

              {/* Feedback banner */}
              {feedbackApplied && feedbackCount > 0 && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-sage/10 border border-sage/20 rounded-2xl animate-fade-in">
                  <div className="w-2 h-2 rounded-full bg-sage shrink-0" />
                  <p className="text-sm text-warm-700">
                    Results improved from {feedbackCount} &quot;Not Me&quot;{" "}
                    {feedbackCount === 1 ? "click" : "clicks"}
                  </p>
                </div>
              )}

              {/* Sensitivity control */}
              <div className="flex items-center gap-4 px-5 py-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-warm-100/80 shadow-sm">
                <label
                  htmlFor="threshold-slider"
                  className="text-xs font-medium text-warm-400 uppercase tracking-wider shrink-0"
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
                  className="flex-1 accent-gradient-purple h-1.5"
                  aria-label="Match sensitivity threshold"
                />
                <span className="text-sm font-mono text-warm-700 w-12 text-right tabular-nums">
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

              {/* Image grid */}
              <div className="animate-fade-in">
                <ImageGrid
                  images={images}
                  eventId={eventId}
                  onImageClick={setPreviewImage}
                  showConfidence
                  confidenceMap={confidenceMap}
                  matchDetailsMap={matchDetailsMap}
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
                onNotMe={handleNotMe}
              />

              {filteredResults.length === 0 && hiddenIds.size > 0 && (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-warm-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-warm-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  </div>
                  <p className="text-warm-500">
                    All results hidden. Try lowering the sensitivity or searching again.
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
                <p className="text-center text-sm text-warm-400 pb-4">
                  See a photo that&apos;s not you? Click it and use &quot;Not
                  Me&quot; to improve results.
                </p>
              )}
            </div>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  // ── Selfie capture view ────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-pink/25 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-sage/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/4 w-[250px] h-[250px] bg-gradient-purple/8 rounded-full blur-3xl" />
          <div className="absolute top-[20%] right-[18%] w-1.5 h-1.5 bg-gradient-purple/40 rounded-full animate-sparkle" />
          <div className="absolute bottom-[35%] left-[12%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1s" }} />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 relative z-10 py-12">
          <div className="w-full max-w-md space-y-8">
            {/* Header */}
            <div className="animate-fade-in">
              <Link
                href={`/event/${eventId}`}
                className="inline-flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 transition-colors mb-3"
                aria-label="Back to event"
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
                Find My Photos
              </h1>
              <p className="text-warm-500 mt-2 leading-relaxed">
                Take a selfie or upload a photo to find all the pictures you appear in
              </p>
            </div>

            {searching ? (
              <div className="text-center py-16 space-y-5 animate-fade-in" role="status">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-warm-100 to-warm-200/80 flex items-center justify-center">
                  <Spinner size="lg" />
                </div>
                <div>
                  <p className="text-warm-700 font-medium">Scanning photos...</p>
                  <p className="text-sm text-warm-400 mt-1">This may take a moment</p>
                </div>
              </div>
            ) : (
              <div className="animate-slide-up stagger-1">
                {mode === "choose" && (
                  <div className="space-y-3">
                    {/* Camera button as hero card */}
                    <button
                      onClick={() => setMode("camera")}
                      className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-br from-gradient-purple to-warm-900 p-6 shadow-lg shadow-gradient-purple/20 transition-all duration-300 hover:shadow-xl hover:shadow-gradient-purple/30 hover:scale-[1.01] active:scale-[0.99] text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-lg font-semibold text-white">Take a Selfie</p>
                          <p className="text-sm text-white/60 mt-0.5">Quick snap with your camera</p>
                        </div>
                        <svg className="w-5 h-5 text-white/40 group-hover:translate-x-1 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </button>

                    {/* Upload button */}
                    <button
                      onClick={() => setMode("upload")}
                      className="w-full group rounded-2xl bg-white/60 backdrop-blur-sm p-5 border border-warm-200/50 transition-all duration-300 hover:bg-white/80 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center shrink-0">
                          <svg className="w-6 h-6 text-warm-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-semibold text-warm-900">Upload a Photo</p>
                          <p className="text-sm text-warm-500 mt-0.5">Use an existing photo of your face</p>
                        </div>
                        <svg className="w-5 h-5 text-warm-300 group-hover:translate-x-1 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </button>
                  </div>
                )}

                {mode === "camera" && (
                  <div className="space-y-4">
                    <SelfieCapture onCapture={handleSelfie} />
                    <button
                      onClick={() => setMode("choose")}
                      className="flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 mx-auto transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                      Back to options
                    </button>
                  </div>
                )}

                {mode === "upload" && (
                  <div className="space-y-4">
                    <SelfieUpload onSelect={handleSelfie} />
                    <button
                      onClick={() => setMode("choose")}
                      className="flex items-center gap-1.5 text-sm text-warm-400 hover:text-warm-600 mx-auto transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                      Back to options
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div
                className="flex items-start gap-3 p-4 bg-red-50/80 border border-red-100 rounded-2xl animate-fade-in"
                role="alert"
              >
                <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
