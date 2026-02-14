"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { DropZone } from "@/components/upload/DropZone";
import { ConsentCheckbox } from "@/components/upload/ConsentCheckbox";
import { useUpload } from "@/hooks/useUpload";
import { getEventStats } from "@/lib/api";
import { formatBytes } from "@/lib/utils";

export default function UploadPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const { upload, cancel, uploading, error, result, progress } =
    useUpload(eventId);

  // Poll event stats after upload for processing progress
  const [processedCount, setProcessedCount] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [processingDone, setProcessingDone] = useState(false);

  const pollProcessing = useCallback(async () => {
    try {
      const stats = await getEventStats(eventId);
      setProcessedCount(stats.processed_count);
      setTotalImages(stats.image_count);
      if (stats.processed_count >= stats.image_count && stats.image_count > 0) {
        setProcessingDone(true);
      }
    } catch {
      // ignore polling errors
    }
  }, [eventId]);

  useEffect(() => {
    if (!result || processingDone) return;
    pollProcessing();
    const interval = setInterval(pollProcessing, 3000);
    return () => clearInterval(interval);
  }, [result, processingDone, pollProcessing]);

  const handleUpload = async () => {
    if (files.length === 0 || !consent) return;
    await upload(files, consent);
    setFiles([]);
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  // Upload progress calculations
  const overallPercent = progress
    ? ((progress.filesCompleted + progress.filesFailed) / progress.totalFiles) *
      100
    : 0;
  const filePercent =
    progress && progress.currentFileTotal > 0
      ? (progress.currentFileLoaded / progress.currentFileTotal) * 100
      : 0;

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href={`/event/${eventId}`}
              className="text-sm text-warm-500 hover:text-warm-700 mb-1 inline-block"
            >
              &larr; Back to event
            </Link>
            <h1 className="text-2xl font-bold text-warm-900">Upload Photos</h1>
          </div>
        </div>

        {/* ── File selection (before upload starts) ─────────────────── */}
        {!result && !uploading && (
          <>
            <DropZone
              onFilesSelected={(newFiles) =>
                setFiles((prev) => [...prev, ...newFiles].slice(0, 50))
              }
            />

            {files.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-warm-600">
                    {files.length} photo{files.length > 1 ? "s" : ""} selected
                    ({formatBytes(totalSize)})
                  </span>
                  <button
                    onClick={() => setFiles([])}
                    className="text-warm-500 hover:text-warm-700"
                  >
                    Clear all
                  </button>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {files.slice(0, 12).map((file, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg overflow-hidden bg-warm-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                  {files.length > 12 && (
                    <div className="aspect-square rounded-lg bg-warm-100 flex items-center justify-center">
                      <span className="text-sm text-warm-500">
                        +{files.length - 12}
                      </span>
                    </div>
                  )}
                </div>

                <ConsentCheckbox checked={consent} onChange={setConsent} />

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    {error}
                  </p>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={!consent}
                  size="lg"
                  className="w-full"
                >
                  Upload {files.length} Photo{files.length > 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── Upload progress (during upload) ───────────────────────── */}
        {uploading && progress && (
          <div className="space-y-5 p-6 bg-warm-50 rounded-xl border border-warm-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-warm-900">
                Uploading Photos
              </h2>
              <Button variant="secondary" size="sm" onClick={cancel}>
                Cancel
              </Button>
            </div>

            {/* Overall progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-warm-700 font-medium">
                  Photo {progress.filesCompleted + 1} of {progress.totalFiles}
                </span>
                <span className="text-warm-500">
                  {Math.round(overallPercent)}%
                </span>
              </div>
              <ProgressBar progress={overallPercent} />
            </div>

            {/* Current file progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-warm-500">
                <span className="truncate max-w-[200px]">
                  {progress.currentFileName}
                </span>
                <span>
                  {formatBytes(progress.currentFileLoaded)} /{" "}
                  {formatBytes(progress.currentFileTotal)}
                </span>
              </div>
              <ProgressBar
                progress={filePercent}
                className="h-1.5"
              />
            </div>

            {progress.filesFailed > 0 && (
              <p className="text-xs text-red-600">
                {progress.filesFailed} file
                {progress.filesFailed > 1 ? "s" : ""} failed
              </p>
            )}
          </div>
        )}

        {/* ── Results (after upload) ────────────────────────────────── */}
        {result && (
          <div className="space-y-6">
            <div className="text-center p-6 bg-warm-50 rounded-xl border border-warm-100">
              <p className="text-warm-800 font-medium">
                {result.images_accepted} photo
                {result.images_accepted !== 1 ? "s" : ""} uploaded successfully!
              </p>
              {result.images_rejected > 0 && (
                <p className="text-sm text-warm-500 mt-1">
                  {result.images_rejected} file
                  {result.images_rejected > 1 ? "s" : ""} were rejected
                </p>
              )}
              {result.duplicates_skipped > 0 && (
                <p className="text-sm text-warm-500 mt-1">
                  {result.duplicates_skipped} duplicate
                  {result.duplicates_skipped > 1 ? "s" : ""} skipped
                </p>
              )}
            </div>

            {/* Processing progress */}
            {totalImages > 0 && !processingDone && (
              <div className="space-y-3 p-5 bg-warm-50 rounded-xl border border-warm-100">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-warm-800">
                    Processing photos ({processedCount}/{totalImages})
                  </span>
                </div>
                <ProgressBar
                  progress={
                    totalImages > 0
                      ? (processedCount / totalImages) * 100
                      : 0
                  }
                />
                <p className="text-xs text-warm-500">
                  Detecting faces &mdash; this may take a minute
                </p>
              </div>
            )}

            {processingDone && (
              <div className="p-4 bg-green-50 rounded-xl border border-green-100 text-center">
                <p className="text-green-800 font-medium">
                  All photos processed!
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Link href={`/event/${eventId}/gallery`} className="flex-1">
                <Button variant="secondary" className="w-full">
                  View Gallery
                </Button>
              </Link>
              <Button
                className="flex-1"
                onClick={() => {
                  setFiles([]);
                  setConsent(false);
                  setProcessedCount(0);
                  setTotalImages(0);
                  setProcessingDone(false);
                  window.location.reload();
                }}
              >
                Upload More
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
