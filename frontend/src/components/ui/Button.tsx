"use client";

import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]";

  const variants = {
    primary:
      "bg-gradient-to-b from-gradient-purple to-warm-800 text-white hover:from-warm-600 hover:to-gradient-purple focus-visible:ring-gradient-purple shadow-md shadow-gradient-purple/20 hover:shadow-lg hover:shadow-gradient-purple/30",
    secondary:
      "bg-white/70 backdrop-blur-sm text-warm-800 hover:bg-white focus-visible:ring-warm-400 border border-warm-200/60 shadow-sm hover:shadow-md",
    ghost:
      "text-warm-500 hover:text-warm-800 hover:bg-warm-100/50 focus-visible:ring-warm-300",
    danger:
      "bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-500 focus-visible:ring-red-500 shadow-md shadow-red-600/20",
  };

  const sizes = {
    sm: "text-xs px-3.5 py-2 tracking-wide",
    md: "text-sm px-6 py-2.5",
    lg: "text-base px-8 py-3.5",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
