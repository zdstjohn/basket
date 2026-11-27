"use client";

import { useEffect, useRef } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { curly } from "@/lib/text/typography";
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

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bk-nav-h)+8px)] z-30 flex justify-center bk-gutter">
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
