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
import { submitSearchFeedback, smartSearch } from "@/lib/api";
import type { ImageRecord, MatchDetails, SmartSearchResponse } from "@/types";

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

  // Smart search state
  const [searchQuery, setSearchQuery] = useState("");
  const [smartResults, setSmartResults] = useState<SmartSearchResponse | null>(null);
  const [smartSearching, setSmartSearching] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  // Unified loading / error state
  const isSearching = searching || smartSearching;
  const searchError = error || smartError;

  const handleSelfie = useCallback(
    async (blob: Blob) => {
      lastSelfieRef.current = blob;
      setSmartResults(null);
      setSmartError(null);

      // If there's a text query, use smart search (hybrid mode)
      if (searchQuery.trim()) {
        setSmartSearching(true);
        try {
          const data = await smartSearch(eventId, {
            query: searchQuery.trim(),
            selfie: blob,
            threshold,
            excludedImageIds: [...hiddenIds],
          });
          setSmartResults(data);
        } catch (err) {
          setSmartError(err instanceof Error ? err.message : "Search failed");
        } finally {
          setSmartSearching(false);
        }
      } else {
        // Face-only search (existing flow)
        await search(blob, threshold);
      }
    },
    [search, threshold, searchQuery, eventId, hiddenIds]
  );

  const handleTextSearch = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;

      setSmartSearching(true);
      setSmartError(null);
      setSmartResults(null);

      try {
        const data = await smartSearch(eventId, {
          query: searchQuery.trim(),
          threshold,
        });
        setSmartResults(data);
      } catch (err) {
        setSmartError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSmartSearching(false);
      }
    },
    [searchQuery, eventId, threshold]
  );

  const handleNotMe = useCallback(
    async (imageId: string) => {
      addHiddenId(imageId);
      const hash = selfieHash || smartResults?.selfie_hash;
      if (hash) {
        submitSearchFeedback(eventId, imageId, hash).catch(() => {});
      }
    },
    [eventId, selfieHash, smartResults, addHiddenId]
  );

  const handleResearch = useCallback(async () => {
    if (smartResults && searchQuery.trim()) {
      // Re-run smart search
      setSmartSearching(true);
      setSmartError(null);
      try {
        const data = await smartSearch(eventId, {
          query: searchQuery.trim(),
          selfie: lastSelfieRef.current || undefined,
          threshold,
          excludedImageIds: [...hiddenIds],
        });
        setSmartResults(data);
      } catch (err) {
        setSmartError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSmartSearching(false);
      }
    } else if (lastSelfieRef.current) {
      await search(lastSelfieRef.current, threshold);
    }
  }, [search, threshold, smartResults, searchQuery, eventId, hiddenIds]);

  const handleClearAll = useCallback(() => {
    clearResults();
    setSmartResults(null);
    setSmartError(null);
    setSearchQuery("");
    lastSelfieRef.current = null;
  }, [clearResults]);

  // ── Build unified results from either search mode ────────────────
  const activeResults = smartResults || results;

  const unifiedResults = smartResults
    ? smartResults.results.map((r) => ({
        image: r.image,
        score: r.similarity ?? r.relevance_score ?? 0,
        match_details: r.match_details,
      }))
    : results
      ? results.results.map((r) => ({
          image: r.image,
          score: r.similarity,
          match_details: r.match_details,
        }))
      : null;

  const filteredResults = unifiedResults?.filter(
    (r) => !hiddenIds.has(r.image.id)
  );

  const confidenceMap = unifiedResults
    ? new Map(unifiedResults.map((r) => [r.image.id, r.score]))
    : new Map<string, number>();

  const matchDetailsMap = unifiedResults
    ? new Map<string, MatchDetails>(
        unifiedResults
          .filter((r) => r.match_details)
          .map((r) => [r.image.id, r.match_details!])
      )
    : new Map<string, MatchDetails>();

  const currentFeedbackApplied = smartResults?.feedback_applied ?? feedbackApplied;
  const currentFeedbackCount =
    smartResults?.feedback_stats?.personal_feedback_count ??
    results?.feedback_stats?.personal_feedback_count ??
    0;

  // ── Results view ──────────────────────────────────────────────────
  if (activeResults && filteredResults) {
    const images = filteredResults.map((r) => r.image);
    const currentIdx = previewImage
      ? images.findIndex((img) => img.id === previewImage.id)
      : -1;

    const searchMode = smartResults?.mode;
    const parsedQuery = smartResults?.parsed_query;
    const hasSelfie = !!lastSelfieRef.current;

    return (
      <ErrorBoundary>
        <div className="min-h-screen relative overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-48 -right-48 w-[550px] h-[550px] bg-gradient-pink/22 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/3 -left-40 w-[400px] h-[400px] bg-gradient-purple/10 rounded-full blur-[100px]" />
            <div className="absolute top-1/2 right-1/4 w-[300px] h-[300px] bg-gradient-blue/8 rounded-full blur-[100px]" />
            <div className="absolute top-[18%] right-[12%] w-1.5 h-1.5 bg-gradient-purple/45 rounded-full animate-sparkle" />
            <div className="absolute bottom-[20%] left-[18%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1.2s" }} />
            <div className="absolute top-[55%] right-[25%] w-1 h-1 bg-sage/40 rounded-full animate-sparkle" style={{ animationDelay: "0.6s" }} />
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
                    {searchMode === "metadata" ? "Search Results" : "Your Photos"}
                  </h1>
                  <p className="text-warm-500 mt-1" aria-live="polite">
                    Found {filteredResults.length} photo
                    {filteredResults.length !== 1 ? "s" : ""}
                    {searchMode && (
                      <span className="text-warm-400">
                        {" "}· {searchMode === "hybrid" ? "face + scene" : "scene search"}
                      </span>
                    )}
                    {hiddenIds.size > 0 && (
                      <span className="text-warm-400">
                        {" "}· {hiddenIds.size} hidden
                      </span>
                    )}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={handleClearAll}>
                  New Search
                </Button>
              </div>

              {/* Parsed query tags */}
              {parsedQuery && (
                <div className="flex flex-wrap gap-2 animate-fade-in">
                  {smartResults?.query && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 glass rounded-full text-sm text-warm-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                      &ldquo;{smartResults.query}&rdquo;
                    </span>
                  )}
                  {parsedQuery.scene && (
                    <span className="px-3 py-1.5 bg-gradient-purple/10 text-gradient-purple text-xs font-semibold rounded-full">
                      {parsedQuery.scene}
                    </span>
                  )}
                  {parsedQuery.lighting && (
                    <span className="px-3 py-1.5 bg-gold/10 text-warm-700 text-xs font-semibold rounded-full">
                      {parsedQuery.lighting}
                    </span>
                  )}
                  {parsedQuery.mood && (
                    <span className="px-3 py-1.5 bg-rose-accent/10 text-rose-accent text-xs font-semibold rounded-full">
                      {parsedQuery.mood}
                    </span>
                  )}
                  {parsedQuery.context && (
                    <span className="px-3 py-1.5 bg-sage/10 text-sage text-xs font-semibold rounded-full">
                      {parsedQuery.context}
                    </span>
                  )}
                  {parsedQuery.people && (
                    <span className="px-3 py-1.5 bg-warm-200/60 text-warm-700 text-xs font-semibold rounded-full">
                      {parsedQuery.people}
                    </span>
                  )}
                </div>
              )}

              {/* Feedback banner */}
              {currentFeedbackApplied && currentFeedbackCount > 0 && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-sage/10 border border-sage/20 rounded-2xl animate-fade-in">
                  <div className="w-2 h-2 rounded-full bg-sage shrink-0" />
                  <p className="text-sm text-warm-700">
                    Results improved from {currentFeedbackCount} &quot;Not Me&quot;{" "}
                    {currentFeedbackCount === 1 ? "click" : "clicks"}
                  </p>
                </div>
              )}

              {/* Sensitivity control (only for face-based searches) */}
              {hasSelfie && (
                <div className="flex items-center gap-4 px-5 py-4 glass rounded-2xl shadow-sm">
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
                    disabled={isSearching}
                  >
                    Re-search
                  </Button>
                </div>
              )}

              {/* Image grid */}
              <div className="animate-fade-in">
                <ImageGrid
                  images={images}
                  eventId={eventId}
                  onImageClick={setPreviewImage}
                  showConfidence={hasSelfie || searchMode === "metadata"}
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
                onNotMe={hasSelfie ? handleNotMe : undefined}
              />

              {filteredResults.length === 0 && hiddenIds.size > 0 && (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-warm-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-warm-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  </div>
                  <p className="text-warm-500">
                    All results hidden. Try adjusting your search or starting over.
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

              {filteredResults.length > 0 && hasSelfie && (
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

  // ── Selfie capture / search view ──────────────────────────────────
  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-48 -right-48 w-[550px] h-[550px] bg-gradient-pink/22 rounded-full blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 w-[450px] h-[450px] bg-gradient-blue/10 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/3 w-[350px] h-[350px] bg-gradient-purple/8 rounded-full blur-[100px]" />
          <div className="absolute top-[20%] right-[18%] w-1.5 h-1.5 bg-gradient-purple/45 rounded-full animate-sparkle" />
          <div className="absolute bottom-[35%] left-[12%] w-1 h-1 bg-rose-accent/30 rounded-full animate-sparkle" style={{ animationDelay: "1s" }} />
          <div className="absolute top-[60%] right-[10%] w-1 h-1 bg-sage/40 rounded-full animate-sparkle" style={{ animationDelay: "0.7s" }} />
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
                Find Photos
              </h1>
              <p className="text-warm-500 mt-2 leading-relaxed">
                Search by selfie, by description, or combine both
              </p>
            </div>

            {isSearching ? (
              <div className="text-center py-16 space-y-5 animate-fade-in" role="status">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-warm-100 to-warm-200/80 flex items-center justify-center">
                  <Spinner size="lg" />
                </div>
                <div>
                  <p className="text-warm-700 font-medium">
                    {searchQuery.trim() ? "AI is searching..." : "Scanning photos..."}
                  </p>
                  <p className="text-sm text-warm-400 mt-1">This may take a moment</p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 animate-slide-up stagger-1">
                {/* Scene search bar */}
                <form onSubmit={handleTextSearch}>
                  <div className="glass rounded-2xl p-4 shadow-sm">
                    <label
                      htmlFor="scene-query"
                      className="block text-[11px] font-semibold text-warm-400 uppercase tracking-[0.12em] mb-2.5"
                    >
                      Search by description
                    </label>
                    <div className="flex gap-2.5">
                      <div className="flex-1 relative">
                        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-300 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <input
                          id="scene-query"
                          type="text"
                          placeholder="e.g. dancing photos at night"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 text-sm text-warm-900 bg-white/50 border border-warm-200/60 rounded-xl placeholder-warm-300/70 focus:outline-none focus:border-gradient-purple focus:ring-1 focus:ring-gradient-purple/20 transition-all"
                        />
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!searchQuery.trim()}
                      >
                        Search
                      </Button>
                    </div>
                    <p className="text-[11px] text-warm-300 mt-2">
                      Try &ldquo;photos on stage&rdquo;, &ldquo;haldi ceremony&rdquo;, or &ldquo;couple portraits&rdquo;
                    </p>
                  </div>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-warm-200/60" />
                  <span className="text-[11px] font-semibold text-warm-300 uppercase tracking-[0.15em]">
                    {searchQuery.trim() ? "and / or add a selfie" : "or find by face"}
                  </span>
                  <div className="flex-1 h-px bg-warm-200/60" />
                </div>

                {mode === "choose" && (
                  <div className="space-y-3">
                    {/* Camera button */}
                    <button
                      onClick={() => setMode("camera")}
                      className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-br from-gradient-purple via-warm-800 to-warm-900 p-6 shadow-lg glow-purple transition-all duration-300 hover:scale-[1.015] active:scale-[0.98] text-left"
                    >
                      <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-gradient-pink/15 blur-2xl pointer-events-none" />
                      <div className="relative flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0" style={{ width: 52, height: 52 }}>
                          <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-lg font-semibold text-white">Take a Selfie</p>
                          <p className="text-sm text-white/60 mt-0.5">
                            {searchQuery.trim()
                              ? "Combine face match with your query"
                              : "Quick snap with your camera"}
                          </p>
                        </div>
                        <svg className="w-5 h-5 text-white/35 group-hover:translate-x-1 transition-transform shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </button>

                    {/* Upload button */}
                    <button
                      onClick={() => setMode("upload")}
                      className="w-full group glass rounded-2xl p-5 transition-all duration-300 hover:bg-white/70 hover:shadow-md hover:scale-[1.01] active:scale-[0.99] text-left"
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
                    {searchQuery.trim() && (
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-gradient-purple/8 rounded-xl">
                        <svg className="w-3.5 h-3.5 text-gradient-purple shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <p className="text-xs text-warm-600 truncate">
                          Will combine with: &ldquo;{searchQuery}&rdquo;
                        </p>
                      </div>
                    )}
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
                    {searchQuery.trim() && (
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-gradient-purple/8 rounded-xl">
                        <svg className="w-3.5 h-3.5 text-gradient-purple shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <p className="text-xs text-warm-600 truncate">
                          Will combine with: &ldquo;{searchQuery}&rdquo;
                        </p>
                      </div>
                    )}
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

            {searchError && (
              <div
                className="flex items-start gap-3 p-4 bg-red-50/80 border border-red-100 rounded-2xl animate-fade-in"
                role="alert"
              >
                <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="text-sm text-red-700">{searchError}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
