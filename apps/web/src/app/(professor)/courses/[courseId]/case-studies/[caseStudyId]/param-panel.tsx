"use client";

// The parameterization panel (frontend guide 4.3, Phase 5.5): the professor
// marks which values vary and within what bounds, and states the invariants that
// keep every variant pedagogically the same. Saving runs the backend's
// figure-frozen check; a value printed inside an essential figure is refused
// with its reason and the two escape hatches. Auto-parameterize loads a proposed
// spec into the same form to review and save (the positioned overlay is a
// follow-up). A client island driving injected server actions.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Schemas } from "@/lib/api/client";
import type { SaveSpecResult } from "@/lib/api/params";
import { strings } from "../../../../strings";
import { AutoOverlay } from "./auto-overlay";

type Parameter = NonNullable<Schemas["ParamSpec"]["parameters"]>[string];
type ParamType = Parameter["type"];
type Row = { name: string; param: Parameter };

const s = strings.params;

function defaultParam(type: ParamType): Parameter {
  switch (type) {
    case "number":
      return { type: "number", base: 0, range: [0, 1], step: null };
    case "integer":
      return { type: "integer", base: 0, range: [0, 10] };
    case "choice":
      return { type: "choice", base: "", options: ["", ""] };
    case "entity":
      return { type: "entity", base: "", description: null };
  }
}

function toRows(spec: Schemas["ParamSpec"] | null): Row[] {
  return Object.entries(spec?.parameters ?? {}).map(([name, param]) => ({
    name,
    param,
  }));
}

const field =
  "rounded-md border border-field-border bg-paper px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function ParamPanel({
  courseId,
  caseStudyId,
  body,
  initial,
  save,
  clear,
  propose,
  makeId = () => crypto.randomUUID(),
}: {
  courseId: number;
  caseStudyId: number;
  body: string;
  initial: Schemas["ParamSpec"] | null;
  save: (
    courseId: number,
    caseStudyId: number,
    spec: Schemas["ParamSpec"],
  ) => Promise<SaveSpecResult>;
  clear: (courseId: number, caseStudyId: number) => Promise<boolean>;
  propose: (
    courseId: number,
    caseStudyId: number,
    key: string,
  ) => Promise<Schemas["ProposalOut"] | null>;
  makeId?: () => string;
}) {
  const [rows, setRows] = useState<Row[]>(toRows(initial));
  const [invariants, setInvariants] = useState<string[]>(initial?.invariants ?? []);
  const [method, setMethod] = useState(initial?.solution_method ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "autoError">("idle");
  const [blocked, setBlocked] = useState<Schemas["BlockedParameter"][]>([]);
  const [busy, setBusy] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<Schemas["ProposalOut"] | null>(null);

  function setParam(index: number, param: Parameter) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, param } : r)));
  }
  function setName(index: number, name: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, name } : r)));
  }

  function buildSpec(): Schemas["ParamSpec"] {
    const parameters: Record<string, Parameter> = {};
    for (const row of rows) {
      if (row.name.trim()) parameters[row.name.trim()] = row.param;
    }
    return {
      parameters,
      invariants: invariants.map((i) => i.trim()).filter(Boolean),
      solution_method: method.trim() || null,
    };
  }

  async function onSave() {
    setBusy(true);
    setStatus("idle");
    setBlocked([]);
    const result = await save(courseId, caseStudyId, buildSpec());
    if ("ok" in result) {
      setStatus("saved");
      setRows(toRows(result.ok));
      setInvariants(result.ok.invariants ?? []);
    } else if ("blocked" in result) {
      setBlocked(result.blocked);
    } else {
      setStatus("error");
    }
    setBusy(false);
  }

  async function onClear() {
    setBusy(true);
    await clear(courseId, caseStudyId);
    setRows([]);
    setInvariants([]);
    setMethod("");
    setStatus("idle");
    setBlocked([]);
    setBusy(false);
  }

  async function onPropose() {
    setProposing(true);
    setStatus("idle");
    const result = await propose(courseId, caseStudyId, makeId());
    if (!result) setStatus("autoError");
    else setProposal(result);
    setProposing(false);
  }

  // Accept loads the proposed spec into the form; the professor still saves.
  function acceptProposal() {
    if (!proposal) return;
    setRows(toRows(proposal.spec));
    setInvariants(proposal.spec.invariants ?? []);
    setMethod(proposal.spec.solution_method ?? "");
    setProposal(null);
  }

  return (
    <section className="flex flex-col gap-5 border-t border-rule-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl">{s.heading}</h2>
        <Button variant="quiet" onClick={() => void onPropose()} disabled={proposing || busy}>
          {s.autoParameterize}
        </Button>
      </div>
      <p className="max-w-prose text-sm text-ink-muted">{s.intro}</p>
      {proposing ? (
        <p role="status" className="text-sm text-ink-muted">
          {s.autoPending}
        </p>
      ) : null}
      {proposal ? (
        <AutoOverlay
          body={body}
          proposal={proposal}
          onAccept={acceptProposal}
          onDismiss={() => setProposal(null)}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{s.empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <li
              key={index}
              className="flex flex-col gap-3 rounded-md border border-rule-line p-3"
            >
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-xs text-ink-muted">{s.name}</span>
                  <input
                    value={row.name}
                    onChange={(e) => setName(index, e.target.value)}
                    className={field}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-ink-muted">{s.type}</span>
                  <select
                    value={row.param.type}
                    onChange={(e) =>
                      setParam(index, defaultParam(e.target.value as ParamType))
                    }
                    className={field}
                  >
                    <option value="number">{s.typeNumber}</option>
                    <option value="integer">{s.typeInteger}</option>
                    <option value="choice">{s.typeChoice}</option>
                    <option value="entity">{s.typeEntity}</option>
                  </select>
                </label>
              </div>
              <ParamFields param={row.param} onChange={(p) => setParam(index, p)} />
              <div>
                <Button
                  variant="quiet"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                >
                  {s.remove}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          variant="quiet"
          onClick={() =>
            setRows((prev) => [...prev, { name: "", param: defaultParam("number") }])
          }
        >
          {s.add}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-ink">{s.invariants}</h3>
        {invariants.map((value, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={value}
              placeholder={s.invariantPlaceholder}
              onChange={(e) =>
                setInvariants((prev) =>
                  prev.map((v, i) => (i === index ? e.target.value : v)),
                )
              }
              className={`${field} flex-1`}
            />
            <Button
              variant="quiet"
              onClick={() =>
                setInvariants((prev) => prev.filter((_, i) => i !== index))
              }
            >
              {s.remove}
            </Button>
          </div>
        ))}
        <div>
          <Button variant="quiet" onClick={() => setInvariants((p) => [...p, ""])}>
            {s.addInvariant}
          </Button>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{s.solutionMethod}</span>
        <textarea
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          rows={2}
          className={field}
        />
      </label>

      {blocked.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md border border-flag-amber/40 p-3">
          <p className="text-sm font-medium text-flag-amber">{s.blockedHeading}</p>
          <ul className="flex flex-col gap-1">
            {blocked.map((b) => (
              <li key={`${b.parameter}-${b.figure_id}`} className="text-sm text-ink">
                {b.reason}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">{s.blockedHatch}</p>
        </div>
      ) : null}

      <div aria-live="polite" className="min-h-5 text-sm">
        {status === "saved" ? (
          <span className="text-verify-green">{s.saved}</span>
        ) : status === "error" ? (
          <span className="text-flag-amber">{s.error}</span>
        ) : status === "autoError" ? (
          <span className="text-flag-amber">{s.autoError}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void onSave()} disabled={busy}>
          {s.save}
        </Button>
        <Button variant="quiet" onClick={() => void onClear()} disabled={busy}>
          {s.clear}
        </Button>
      </div>
    </section>
  );
}

function ParamFields({
  param,
  onChange,
}: {
  param: Parameter;
  onChange: (param: Parameter) => void;
}) {
  if (param.type === "number" || param.type === "integer") {
    return (
      <div className="flex flex-wrap gap-3">
        <NumField label={s.baseLabel} value={param.base} onChange={(base) => onChange({ ...param, base })} />
        <NumField
          label={s.rangeFrom}
          value={param.range[0]}
          onChange={(v) => onChange({ ...param, range: [v, param.range[1]] })}
        />
        <NumField
          label={s.rangeTo}
          value={param.range[1]}
          onChange={(v) => onChange({ ...param, range: [param.range[0], v] })}
        />
        {param.type === "number" ? (
          <NumField
            label={s.step}
            value={param.step ?? 0}
            onChange={(step) => onChange({ ...param, step: step || null })}
          />
        ) : null}
      </div>
    );
  }
  if (param.type === "choice") {
    return (
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{s.baseLabel}</span>
          <input value={param.base} onChange={(e) => onChange({ ...param, base: e.target.value })} className={field} />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-ink-muted">{s.options}</span>
          <textarea
            value={param.options.join("\n")}
            onChange={(e) => onChange({ ...param, options: e.target.value.split("\n") })}
            rows={3}
            className={field}
          />
        </label>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">{s.baseLabel}</span>
        <input value={param.base} onChange={(e) => onChange({ ...param, base: e.target.value })} className={field} />
      </label>
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-xs text-ink-muted">{s.description}</span>
        <input
          value={param.description ?? ""}
          onChange={(e) => onChange({ ...param, description: e.target.value || null })}
          className={field}
        />
      </label>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-ink-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${field} w-28`}
      />
    </label>
  );
}
