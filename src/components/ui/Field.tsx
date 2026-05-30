import type { ComponentProps, ReactNode } from "react";

// Form field primitives per design-system.md §4.3.
// - Label always visible ABOVE the input (never placeholder-only / a11y).
// - Input: bg.surface, 1px line.200, radius.sm, height 48px, focus ring accent.500.
// - Placeholder ink.300. Hint below in caption. Counter bottom-right caption.
// - Error: state.danger border + red message below stating a concrete reason.

const inputBase =
  "w-full rounded-sm border bg-bg-surface px-3 font-sans text-[15px] text-ink-900 placeholder:text-ink-300 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500";

function borderClass(error?: string): string {
  return error ? "border-state-danger" : "border-line-200";
}

export function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block font-sans text-[13px] font-semibold text-ink-700"
    >
      {children}
      {required ? (
        <span className="ml-1 align-middle text-[11px] font-normal text-ink-500">
          必須
        </span>
      ) : (
        <span className="ml-1 align-middle text-[11px] font-normal text-ink-300">
          任意
        </span>
      )}
    </label>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 font-sans text-xs leading-relaxed text-ink-500">
      {children}
    </p>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-1.5 font-sans text-xs leading-relaxed text-state-danger"
    >
      {children}
    </p>
  );
}

type TextFieldProps = {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  counter?: { value: number; max: number };
} & Omit<ComponentProps<"input">, "className">;

export function TextField({
  label,
  required,
  hint,
  error,
  counter,
  id,
  ...rest
}: TextFieldProps) {
  const fieldId = id ?? rest.name;
  return (
    <div>
      <FieldLabel htmlFor={fieldId} required={required}>
        {label}
      </FieldLabel>
      <input
        id={fieldId}
        className={`h-12 ${inputBase} ${borderClass(error)}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {error ? <FieldError>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
        </div>
        {counter ? (
          <span className="mt-1.5 shrink-0 font-sans text-xs tabular-nums text-ink-500">
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
    </div>
  );
}

type TextAreaProps = {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  counter?: { value: number; max: number };
} & Omit<ComponentProps<"textarea">, "className">;

export function TextArea({
  label,
  required,
  hint,
  error,
  counter,
  id,
  rows = 4,
  ...rest
}: TextAreaProps) {
  const fieldId = id ?? rest.name;
  return (
    <div>
      <FieldLabel htmlFor={fieldId} required={required}>
        {label}
      </FieldLabel>
      <textarea
        id={fieldId}
        rows={rows}
        className={`resize-none py-3 leading-7 ${inputBase} ${borderClass(error)}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {error ? <FieldError>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
        </div>
        {counter ? (
          <span className="mt-1.5 shrink-0 font-sans text-xs tabular-nums text-ink-500">
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
    </div>
  );
}
