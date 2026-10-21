import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// Form controls (decision 0102). A field's boundary is a UI component
// boundary, so it draws in field-border (3:1, decision 0062) on the raised
// surface, and the focus state is the shared accent outline. Server-compatible:
// uncontrolled by default, so a Server Action form needs no script; the client
// forms pass value/onChange through. Numeric data is tabular everywhere.
const control =
  "w-full min-w-0 rounded-md border border-field-border bg-surface px-3.5 py-2.5 text-ink " +
  "placeholder:text-ink-muted/70 shadow-[inset_0_1px_1px_rgba(22,26,35,0.04)] " +
  "transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) " +
  "hover:border-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
  "disabled:opacity-50 disabled:pointer-events-none";

export function inputClassName(className?: string): string {
  return [control, className].filter(Boolean).join(" ");
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClassName(className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={inputClassName(["leading-relaxed", className].join(" "))} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClassName(className)} {...rest} />;
}

// Label, control, hint, and error as one stack. The label wraps the control
// so no id plumbing is needed; a hint is read with the label by being inside
// it. An error is a live line in amber, stating what happened and what to do
// next (guide 3.4).
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-sm text-ink-muted">{hint}</span> : null}
      {error ? (
        <span role="alert" className="text-sm text-flag-amber">
          {error}
        </span>
      ) : null}
    </label>
  );
}
