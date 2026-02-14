"use client";

import { useState, useEffect, useCallback } from "react";
import { getJobStatus } from "@/lib/api";
import type { ProcessingJob } from "@/types";

export function useJobStatus(jobId: string | null, pollInterval = 2000) {
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const data = await getJobStatus(jobId);
      setJob(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get job status");
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    poll();
    const interval = setInterval(async () => {
      const data = await poll();
      if (data && (data.status === "completed" || data.status === "failed")) {
        clearInterval(interval);
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [jobId, pollInterval, poll]);

  return { job, error };
}
