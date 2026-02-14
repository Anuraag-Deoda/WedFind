"use client";

import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ProcessingJob } from "@/types";

interface UploadProgressProps {
  job: ProcessingJob | null;
  imagesAccepted: number;
}

export function UploadProgress({ job, imagesAccepted }: UploadProgressProps) {
  if (!job) return null;

  const progress =
    job.total_images > 0
      ? ((job.processed_images + job.failed_images) / job.total_images) * 100
      : 0;

  const statusLabel = {
    pending: "Waiting to process...",
    processing: `Processing photos (${job.processed_images}/${job.total_images})`,
    completed: "All photos processed!",
    failed: "Processing failed",
  }[job.status];

  return (
    <div className="space-y-3 p-5 bg-warm-50 rounded-xl border border-warm-100">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-warm-800">{statusLabel}</span>
        {job.status === "completed" && (
          <span className="text-sage font-medium">
            {job.total_faces_found} faces found
          </span>
        )}
      </div>
      <ProgressBar progress={progress} />
      {job.failed_images > 0 && (
        <p className="text-sm text-red-600">
          {job.failed_images} image{job.failed_images > 1 ? "s" : ""} failed to
          process
        </p>
      )}
    </div>
  );
}
