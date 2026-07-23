"use client";

// Client component: controlled fields, submit state, and the live-region
// failure line require interactivity. Login itself runs in a server action that
// sets the httpOnly session cookie (decision 0012).

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { strings } from "../strings";
import { signIn } from "./actions";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Empty fields cannot sign in; no round trip needed, and the one generic
    // line covers it just as it covers a wrong credential (backend 7.1).
    if (!email || !password) {
      setFailed(true);
      return;
    }
    setPending(true);
    try {
      const result = await signIn(email, password);
      if (result.ok) {
        router.push("/dashboard");
      } else {
        setFailed(true);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-6">
      <Field
        label={strings.signIn.emailLabel}
        type="email"
        autoComplete="username"
        value={email}
        onChange={(next) => {
          setEmail(next);
          setFailed(false);
        }}
      />
      <Field
        label={strings.signIn.passwordLabel}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(next) => {
          setPassword(next);
          setFailed(false);
        }}
      />
      <Button type="submit" disabled={pending}>
        {strings.signIn.action}
      </Button>
      <p role="status" className="min-h-6 text-sm text-ink">
        {failed ? strings.signIn.failure : ""}
      </p>
    </form>
  );
}

function Field({
  label,
  type,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-ink">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={
          "rounded-md border border-rule-line bg-paper px-4 py-3 " +
          "text-ink " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        }
      />
    </label>
  );
}
