import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  name,
  className,
}: {
  name?: string;
  className?: string;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground",
        className
      )}
    >
      {initials}
    </div>
  );
}
