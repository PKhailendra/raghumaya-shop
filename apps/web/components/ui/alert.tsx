import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, Info, CheckCircle2 } from "lucide-react";

const icons = {
  info: Info,
  error: AlertCircle,
  success: CheckCircle2,
};

const styles: Record<string, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  error: "border-red-200 bg-red-50 text-red-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof icons;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[variant];
  return (
    <div className={cn("flex gap-3 rounded-md border p-4 text-sm", styles[variant], className)}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        {title && <div className="font-semibold mb-1">{title}</div>}
        {children}
      </div>
    </div>
  );
}
