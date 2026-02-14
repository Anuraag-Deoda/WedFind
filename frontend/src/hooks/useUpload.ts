"use client";

import { useState, useCallback, useRef } from "react";
import { uploadSingleImage } from "@/lib/api";
import type { UploadResponse } from "@/types";

export interface UploadProgress {
  /** Index of the file currently uploading (0-based) */
  currentFileIndex: number;
  /** Total files to upload */
  totalFiles: number;
  /** Bytes uploaded for the current file */
  currentFileLoaded: number;
  /** Total bytes of the current file */
  currentFileTotal: number;
  /** Name of the current file */
  currentFileName: string;
  /** Number of files completed so far */
  filesCompleted: number;
  /** Number of files that failed */
  filesFailed: number;
}

export interface AggregatedResult {
  job_ids: string[];
  images_accepted: number;
  images_rejected: number;
  duplicates_skipped: number;
}

export function useUpload(eventId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AggregatedResult | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const cancelledRef = useRef(false);

  const upload = useCallback(
    async (files: File[], consent: boolean) => {
      setUploading(true);
      setError(null);
      setResult(null);
      cancelledRef.current = false;

      const aggregated: AggregatedResult = {
        job_ids: [],
        images_accepted: 0,
        images_rejected: 0,
        duplicates_skipped: 0,
      };

      let filesCompleted = 0;
      let filesFailed = 0;

      for (let i = 0; i < files.length; i++) {
        if (cancelledRef.current) break;

        const file = files[i];

        setProgress({
          currentFileIndex: i,
          totalFiles: files.length,
          currentFileLoaded: 0,
          currentFileTotal: file.size,
          currentFileName: file.name,
          filesCompleted,
          filesFailed,
        });

        try {
          const { promise, abort } = uploadSingleImage(
            eventId,
            file,
            consent,
            (loaded, total) => {
              setProgress((prev) =>
                prev
                  ? { ...prev, currentFileLoaded: loaded, currentFileTotal: total }
                  : null
              );
            }
          );

          abortRef.current = abort;
          const data: UploadResponse = await promise;

          aggregated.job_ids.push(data.job_id);
          aggregated.images_accepted += data.images_accepted;
          aggregated.images_rejected += data.images_rejected;
          aggregated.duplicates_skipped += data.duplicates_skipped;
          filesCompleted++;
        } catch (err) {
          filesFailed++;
          // Continue uploading remaining files even if one fails
          if (
            err instanceof Error &&
            err.message === "Upload cancelled"
          ) {
            break;
          }
        }

        setProgress((prev) =>
          prev ? { ...prev, filesCompleted, filesFailed } : null
        );
      }

      abortRef.current = null;

      if (filesCompleted > 0) {
        setResult(aggregated);
      } else if (filesFailed > 0) {
        setError(`All ${filesFailed} uploads failed`);
      }

      setUploading(false);
      return aggregated;
    },
    [eventId]
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.();
  }, []);

  return { upload, cancel, uploading, error, result, progress };
}
