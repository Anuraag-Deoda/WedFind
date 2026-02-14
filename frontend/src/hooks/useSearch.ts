"use client";

import { useState, useCallback, useEffect } from "react";
import { searchFaces } from "@/lib/api";
import type { SearchResponse } from "@/types";

const HIDDEN_IDS_KEY = "camera_hidden_ids";

function loadHiddenIds(eventId: string): Set<string> {
  try {
    const stored = localStorage.getItem(`${HIDDEN_IDS_KEY}_${eventId}`);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {
    // Ignore parse errors
  }
  return new Set();
}

function saveHiddenIds(eventId: string, ids: Set<string>) {
  try {
    localStorage.setItem(
      `${HIDDEN_IDS_KEY}_${eventId}`,
      JSON.stringify([...ids])
    );
  } catch {
    // Ignore storage errors
  }
}

export function useSearch(eventId: string) {
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [selfieHash, setSelfieHash] = useState<string | null>(null);
  const [feedbackApplied, setFeedbackApplied] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() =>
    loadHiddenIds(eventId)
  );

  // Persist hiddenIds to localStorage whenever they change
  useEffect(() => {
    saveHiddenIds(eventId, hiddenIds);
  }, [eventId, hiddenIds]);

  const addHiddenId = useCallback((imageId: string) => {
    setHiddenIds((prev) => new Set([...prev, imageId]));
  }, []);

  const clearHiddenIds = useCallback(() => {
    setHiddenIds(new Set());
  }, []);

  const search = useCallback(
    async (
      selfie: Blob,
      threshold?: number,
      excludedImageIds?: string[]
    ) => {
      setSearching(true);
      setError(null);
      setResults(null);

      // Merge persisted hidden IDs with any explicitly passed exclusions
      const allExcluded = new Set([
        ...hiddenIds,
        ...(excludedImageIds || []),
      ]);

      try {
        const data = await searchFaces(
          eventId,
          selfie,
          threshold,
          allExcluded.size > 0 ? [...allExcluded] : undefined
        );
        setResults(data);
        setSelfieHash(data.selfie_hash);
        setFeedbackApplied(data.feedback_applied);
        return data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Search failed";
        setError(message);
        return null;
      } finally {
        setSearching(false);
      }
    },
    [eventId, hiddenIds]
  );

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return {
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
  };
}
