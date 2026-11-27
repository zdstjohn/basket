"use client";

import { useEffect, useRef } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { curly } from "@/lib/text/typography";
import { BAR_CLASS, barLift, toastBottom } from "@/lib/ui";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** A short message above the nav. It leaves by itself after ms (4 seconds unless told otherwise). */
export function Toast({
  message,
  tone,
  action,
  ms = 4000,
  onDone,
  testId,
}: {
  message: string;
  tone: "ok" | "bad";
  action?: { label: string; onAction: () => void };
  ms?: number;
  onDone: () => void;
  testId?: string;
}) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => done.current(), ms);
    return () => clearTimeout(t);
  }, [ms, message]);

  // A screen's pinned main-action bar (barAboveNav / barBottom) is never covered: lift above it.
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    const bar = document.querySelector<HTMLElement>(`.${BAR_CLASS}`);
    if (!el) return;
    const apply = () => el.style.setProperty("--bk-bar-h", barLift(bar?.offsetHeight));
    apply();
    if (!bar || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className={`pointer-events-none fixed inset-x-0 ${toastBottom} z-30 flex justify-center bk-gutter`}>
      <div
        role="status"
        data-testid={testId}
        className="bk-fade-in pointer-events-auto flex items-center gap-2 rounded-md bg-raised p-3 text-small text-ink shadow-1"
      >
        <Icon icon={tone === "ok" ? Check : TriangleAlert} size={18} className={tone === "ok" ? undefined : "text-error"} />
        <span className="min-w-0">{curly(message)}</span>
        {action && (
          <Button variant="ghost" onClick={action.onAction}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
