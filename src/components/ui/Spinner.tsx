import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("spinner", className)} aria-hidden />;
}
