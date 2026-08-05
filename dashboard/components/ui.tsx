import { cn } from "@/lib/ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";
export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "destructive";
}) {
  const styles = {
    primary:
      "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90",
    secondary: "border bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]",
    destructive: "bg-[hsl(var(--destructive))] text-white hover:opacity-90",
  };
  return (
    <button
      className={cn(
        "motion-safe-transition inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border bg-[hsl(var(--card))] p-5", className)}
    >
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const styles = {
    neutral: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
    bad: "bg-red-500/15 text-red-700 dark:text-red-300",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}
