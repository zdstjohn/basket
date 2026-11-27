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

/** The caller's own aria-describedby plus the error's id; aria-invalid stays whatever the caller set unless there is an error. */
function aria(fid: string, error: string | undefined, props: { "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" }) {
  const ids = [props["aria-describedby"], error ? `${fid}-error` : undefined].filter(Boolean).join(" ");
  return {
    "aria-describedby": ids || undefined,
    "aria-invalid": error ? true : props["aria-invalid"],
  };
}

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
          className={`${BOX} ${icon ? "pl-12" : ""}`}
          {...inputProps}
          {...aria(fid, error, inputProps)}
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
        className={`${BOX.replace("min-h-11 ", "")} min-h-24 py-2`}
        {...areaProps}
        {...aria(fid, error, areaProps)}
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
          className={`${BOX} appearance-none pr-12`}
          {...selectProps}
          {...aria(fid, error, selectProps)}
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
