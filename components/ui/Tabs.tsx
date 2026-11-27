"use client";

import { useRef } from "react";

/** The tab bar of a screen. Arrow keys move and select; only the selected tab is a tab stop. The caller renders the role="tabpanel" with id={panelId}. */
export function Tabs<T extends string>({
  label,
  items,
  active,
  onChange,
  panelId,
}: {
  label: string;
  items: { id: T; label: string; detail?: string }[];
  active: T;
  onChange: (id: T) => void;
  panelId: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function go(index: number) {
    const next = (index + items.length) % items.length;
    onChange(items[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex border-b border-line">
      {items.map((it, i) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${panelId}-tab-${it.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                go(i + 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                go(i - 1);
              } else if (e.key === "Home") {
                e.preventDefault();
                go(0);
              } else if (e.key === "End") {
                e.preventDefault();
                go(items.length - 1);
              }
            }}
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center border-b-2 px-2 text-small ${
              on ? "border-accent font-bold text-accent" : "border-transparent text-ink-soft"
            }`}
          >
            <span>{it.label}</span>
            {it.detail && <span className="text-label font-normal">{it.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}
