"use client";

import { useEffect, useRef } from "react";

/** A bottom sheet on the browser's own modal dialog: it traps focus and closes on Escape. */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[20px] bg-white p-0 text-ink backdrop:bg-black/40"
    >
      {children}
    </dialog>
  );
}
