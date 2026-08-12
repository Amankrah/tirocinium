"use client";

// Client component: controlled fields, submit state, and the live-region
// failure line require interactivity. Signup itself runs in a server action
// that sets the httpOnly session cookie (decision 0065). The API still takes
// only email and password (SignupIn); confirm is checked here and never sent.

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { strings } from "../strings";
import { signUp } from "./actions";

// SignupIn on the backend is min_length=10; refuse here so a short password
// never spends a round trip.
const MIN_PASSWORD = 10;

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!email || !password || !confirm) {
      setError(strings.signUp.missing);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(strings.signUp.tooShort);
      return;
    }
    if (password !== confirm) {
      setError(strings.signUp.mismatch);
      return;
    }
    setPending(true);
    try {
      const result = await signUp(email, password);
      if (result.ok) {
        router.push("/dashboard");
        return;
      }
      if (result.reason === "exists") setError(strings.signUp.exists);
      else if (result.reason === "invalid") setError(strings.signUp.invalid);
      else setError(strings.signUp.unavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
      <Field
        label={strings.signUp.emailLabel}
        type="email"
        autoComplete="username"
        value={email}
        onChange={(next) => {
          setEmail(next);
          setError(null);
        }}
      />
      <Field
        label={strings.signUp.passwordLabel}
        type="password"
        autoComplete="new-password"
        hint={strings.signUp.passwordHint}
        value={password}
        onChange={(next) => {
          setPassword(next);
          setError(null);
        }}
      />
      <Field
        label={strings.signUp.confirmLabel}
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(next) => {
          setConfirm(next);
          setError(null);
        }}
      />
      <Button type="submit" disabled={pending} className="py-3">
        {strings.signUp.action}
      </Button>
      <p role="status" className="min-h-6 text-sm text-ink">
        {error ?? ""}
      </p>
    </form>
  );
}

function Field({
  label,
  type,
  autoComplete,
  hint,
  value,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  autoComplete: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          "rounded-md border border-field-border bg-paper px-4 py-3 " +
          "text-ink " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        }
      />
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
