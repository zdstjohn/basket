"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { curly } from "@/lib/text/typography";
import { textInput } from "@/lib/ui";
import { Icon } from "./Icon";

type Shared = {
  label: string;
  error?: string;
  /** Hides the label from sight; readers still get it. */
  hideLabel?: boolean;
  className?: string;
};

function Frame({
  id,
  label,
  hideLabel,
  error,
  className,
  children,
}: Shared & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1 block text-small text-ink-soft"}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-small text-error">
          {curly(error)}
        </p>
      )}
    </div>
  );
}

const BOX = `${textInput} placeholder:text-ink-soft`;

export function TextField({
  label,
  error,
  hideLabel,
  className,
  icon,
  id,
  ...inputProps
}: Shared & { icon?: LucideIcon } & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Frame id={fid} label={label} hideLabel={hideLabel} error={error} className={className}>
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">
            <Icon icon={icon} size={18} />
          </span>
        )}
        <input
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-error` : undefined}
          className={`${BOX} ${icon ? "pl-12" : ""}`}
          {...inputProps}
        />
      </div>
    </Frame>
  );
}

export function TextAreaField({
  label,
  error,
  hideLabel,
  className,
  id,
  ...areaProps
}: Shared & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Frame id={fid} label={label} hideLabel={hideLabel} error={error} className={className}>
      <textarea
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : undefined}
        className={`${BOX} min-h-24 py-2`}
        {...areaProps}
      />
    </Frame>
  );
}

export function SelectField({
  label,
  error,
  hideLabel,
  className,
  id,
  children,
  ...selectProps
}: Shared & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Frame id={fid} label={label} hideLabel={hideLabel} error={error} className={className}>
      <div className="relative">
        <select
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fid}-error` : undefined}
          className={`${BOX} appearance-none pr-12`}
          {...selectProps}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-soft">
          <Icon icon={ChevronDown} size={18} />
        </span>
      </div>
    </Frame>
  );
}
