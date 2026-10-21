"use client";

// The parameterization panel (frontend guide 4.3, Phase 5.5): the professor
// marks which values vary and within what bounds, and states the invariants that
// keep every variant pedagogically the same. Saving runs the backend's
// figure-frozen check; a value printed inside an essential figure is refused
// with its reason and the two escape hatches. Auto-parameterize loads a proposed
// spec into the same form to review and save (the positioned overlay is a
// follow-up). A client island driving injected server actions.
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Schemas } from "@/lib/api/client";
import type { SaveSpecResult } from "@/lib/api/params";
import { strings } from "../../../../strings";
import { AutoOverlay, rangeSummary } from "./auto-overlay";

type Parameter = NonNullable<Schemas["ParamSpec"]["parameters"]>[string];
type ParamType = Parameter["type"];
type Row = { name: string; param: Parameter };

const s = strings.params;

const TYPE_LABEL: Record<ParamType, string> = {
  number: s.typeNumber,
  integer: s.typeInteger,
  choice: s.typeChoice,
  entity: s.typeEntity,
};

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
    <Card as="section" aria-labelledby="params-heading" className="flex flex-col gap-5">
      <SectionHeading
        id="params-heading"
        title={s.heading}
        description={s.intro}
        actions={
          <Button
            variant="secondary"
            onClick={() => void onPropose()}
            disabled={proposing || busy}
          >
            <Icon name="sparkle" size={16} />
            {s.autoParameterize}
          </Button>
        }
      />
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
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => {
            const summary = rangeSummary(row.param);
            return (
              <Card key={index} as="li" tone="flat" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{TYPE_LABEL[row.param.type]}</Badge>
                  {summary ? (
                    <span className="font-mono text-xs tabular-nums text-ink-muted">{summary}</span>
                  ) : null}
                  <Button
                    variant="quiet"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Icon name="x" size={14} />
                    {s.remove}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Field label={s.name}>
                    <Input value={row.name} onChange={(e) => setName(index, e.target.value)} />
                  </Field>
                  <Field label={s.type}>
                    <Select
                      value={row.param.type}
                      onChange={(e) =>
                        setParam(index, defaultParam(e.target.value as ParamType))
                      }
                    >
                      <option value="number">{s.typeNumber}</option>
                      <option value="integer">{s.typeInteger}</option>
                      <option value="choice">{s.typeChoice}</option>
                      <option value="entity">{s.typeEntity}</option>
                    </Select>
                  </Field>
                </div>
                <ParamFields param={row.param} onChange={(p) => setParam(index, p)} />
              </Card>
            );
          })}
        </ul>
      )}

      <div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setRows((prev) => [...prev, { name: "", param: defaultParam("number") }])
          }
        >
          <Icon name="plus" size={14} />
          {s.add}
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-t border-rule-line pt-5">
        <h3 className="font-display text-xl">{s.invariants}</h3>
        {invariants.map((value, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={value}
              placeholder={s.invariantPlaceholder}
              onChange={(e) =>
                setInvariants((prev) =>
                  prev.map((v, i) => (i === index ? e.target.value : v)),
                )
              }
              className="flex-1"
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
          <Button variant="secondary" size="sm" onClick={() => setInvariants((p) => [...p, ""])}>
            <Icon name="plus" size={14} />
            {s.addInvariant}
          </Button>
        </div>
      </div>

      <Field label={s.solutionMethod}>
        <Textarea value={method} onChange={(e) => setMethod(e.target.value)} rows={2} />
      </Field>

      {blocked.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-lg border border-flag-amber/40 bg-flag-amber-soft p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-flag-amber">
            <Icon name="lock" size={14} />
            {s.blockedHeading}
          </p>
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
    </Card>
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
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Field label={s.baseLabel}>
          <Input value={param.base} onChange={(e) => onChange({ ...param, base: e.target.value })} />
        </Field>
        <Field label={s.options}>
          <Textarea
            value={param.options.join("\n")}
            onChange={(e) => onChange({ ...param, options: e.target.value.split("\n") })}
            rows={3}
          />
        </Field>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
      <Field label={s.baseLabel}>
        <Input value={param.base} onChange={(e) => onChange({ ...param, base: e.target.value })} />
      </Field>
      <Field label={s.description}>
        <Input
          value={param.description ?? ""}
          onChange={(e) => onChange({ ...param, description: e.target.value || null })}
        />
      </Field>
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
    <Field label={label} className="w-32">
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="font-mono tabular-nums"
      />
    </Field>
  );
}
