import { cn } from "@/lib/utils";

export function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-4 w-4 border-[2px]", md: "h-8 w-8 border-[2.5px]", lg: "h-12 w-12 border-[3px]" };
  return (
    <div
      className={cn(
        "rounded-full border-warm-200 border-t-warm-600 animate-spin",
        sizes[size],
        className
      )}
    />
  );
}
