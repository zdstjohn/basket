"use client";

import { TriangleAlert } from "lucide-react";
import { curly } from "@/lib/text/typography";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** Placeholder lines while text loads. Pair every group with a <Loading>. */
export function SkeletonLines({ lines, size }: { lines: number; size: "body" | "small" }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`bk-skeleton rounded-xs ${size === "body" ? "h-4" : "h-3"} ${i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** A placeholder photo at the hero (2:1, full bleed) or tile (8:5) crop. */
export function SkeletonTile({ crop }: { crop: "hero" | "tile" }) {
  return <div aria-hidden="true" className={`bk-skeleton w-full ${crop === "hero" ? "aspect-hero" : "aspect-tile rounded-md"}`} />;
}

/** The words a screen reader hears while a skeleton shows. */
export function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="sr-only">
      {label}
    </div>
  );
}

/** One sentence and, at most, one ghost action. */
export function EmptyState({ sentence, action }: { sentence: string; action?: { label: string; onAction: () => void } }) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <p className="text-body text-ink">{curly(sentence)}</p>
      {action && (
        <Button variant="ghost" onClick={action.onAction}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** What failed, and the retry as a button. */
export function ErrorBanner({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md bg-error-tint p-3 text-small text-error">
      <Icon icon={TriangleAlert} size={18} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <p>{curly(message)}</p>
        {actionLabel && onAction && (
          <Button variant="ghost" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
