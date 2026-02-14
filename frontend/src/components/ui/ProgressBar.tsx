import { cn } from "@/lib/utils";

export function ProgressBar({
  progress,
  className,
}: {
  progress: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full bg-warm-100 rounded-full h-2 overflow-hidden", className)}>
      <div
        className="bg-warm-600 h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
