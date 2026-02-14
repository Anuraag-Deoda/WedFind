"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  accept?: string;
}

export function DropZone({
  onFilesSelected,
  maxFiles = 50,
  accept = "image/jpeg,image/png,image/webp,image/heic,image/heif",
}: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files = Array.from(fileList).slice(0, maxFiles);
      onFilesSelected(files);
    },
    [onFilesSelected, maxFiles]
  );

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300",
        dragOver
          ? "border-gradient-purple/50 bg-gradient-purple/5 scale-[1.01]"
          : "border-warm-200/60 hover:border-warm-300 hover:bg-white/40 glass"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-warm-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-warm-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
          </svg>
        </div>
        <div>
          <p className="text-warm-800 font-medium">
            Drop photos here or click to browse
          </p>
          <p className="text-sm text-warm-500 mt-1">
            JPEG, PNG, WebP, HEIC up to 50 photos at once
          </p>
        </div>
      </div>
    </div>
  );
}
