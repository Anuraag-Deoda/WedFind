"use client";

import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-medium text-warm-500 uppercase tracking-wider"
        >
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          "w-full rounded-2xl border border-warm-200/80 bg-white/80 backdrop-blur-sm px-4 py-3 text-warm-900 placeholder-warm-300 transition-all focus:border-warm-400 focus:outline-none focus:ring-2 focus:ring-warm-500/15 focus:bg-white shadow-sm",
          error && "border-red-300 focus:border-red-400 focus:ring-red-500/15",
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
}
