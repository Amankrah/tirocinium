import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SectionHeading } from "@/components/ui/section-heading";
import type { CourseChallenge } from "@/lib/api/marketplace-authoring";
import { strings } from "../../../strings";

// The challenge form (decision 0112), a plain HTML form posting a server
// action so the page ships no client JavaScript. The requirements statement
// comes first and the answer half last under its own heading, because the
// professor is writing two things a student meets at different times.
const CRITERIA: { key: string; label: string }[] = [
  { key: "cost", label: "Cost per kg" },
  { key: "strength", label: "Specific strength" },
  { key: "stiffness", label: "Specific stiffness" },
  { key: "toughness", label: "Fracture toughness" },
  { key: "temperature", label: "Max service temperature" },
  { key: "corrosion", label: "Corrosion resistance" },
  { key: "uv", label: "UV resistance" },
  { key: "embodied_energy", label: "Embodied energy" },
  { key: "carbon", label: "Carbon footprint" },
  { key: "recyclability", label: "Recyclability" },
  { key: "lead", label: "Lead time" },
];

export function ChallengeForm({
  action,
  challenge,
}: {
  action: (formData: FormData) => Promise<void>;
  challenge: CourseChallenge | null;
}) {
  const s = strings.challenges;
  return (
    <form action={action} className="flex flex-col gap-8">
      <Card as="div" className="flex flex-col gap-5">
        <Field label={s.titleLabel}>
          <Input name="title" defaultValue={challenge?.title ?? ""} required maxLength={200} />
        </Field>
        <Field label={s.contextLabel} hint={s.contextHint}>
          <Textarea name="context" defaultValue={challenge?.context ?? ""} rows={4} maxLength={4000} />
        </Field>
        <Field label={s.requirementsLabel} hint={s.requirementsHint}>
          <Textarea
            name="requirements"
            rows={6}
            required
            defaultValue={(challenge?.requirements ?? [])
              .map((r) => (r.target ? `${r.text} | ${r.target}` : r.text))
              .join("\n")}
          />
        </Field>
        <Field label={s.constraintsLabel} hint={s.constraintsHint}>
          <Textarea
            name="constraints"
            rows={3}
            defaultValue={(challenge?.constraints ?? []).join("\n")}
          />
        </Field>
        <Field label={s.deliverableLabel} hint={s.deliverableHint}>
          <Textarea name="deliverable" rows={3} defaultValue={challenge?.deliverable ?? ""} maxLength={1500} />
        </Field>
      </Card>

      <section className="flex flex-col gap-4">
        <SectionHeading id="weights" title={s.weightsLabel} description={s.weightsHint} level={3} />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CRITERIA.map((criterion) => (
            <li key={criterion.key}>
              <Field label={criterion.label}>
                <Input
                  type="number"
                  name={`weight-${criterion.key}`}
                  min={0}
                  max={5}
                  step={1}
                  defaultValue={challenge?.weights?.[criterion.key] ?? 0}
                  className="w-24"
                />
              </Field>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeading id="answer" title={s.answerHeading} level={3} />
        <Card as="div" className="flex flex-col gap-5">
          <Field label={s.familiesLabel} hint={s.familiesHint}>
            <Input
              name="candidate_families"
              defaultValue={challenge?.candidate_families ?? ""}
              maxLength={400}
            />
          </Field>
          <Field label={s.shortlistLabel} hint={s.shortlistHint}>
            <Textarea
              name="shortlist"
              rows={5}
              defaultValue={(challenge?.shortlist ?? []).join("\n")}
              className="font-mono"
              spellCheck={false}
            />
          </Field>
        </Card>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="save" variant="secondary">
          {s.save}
        </Button>
        {challenge?.status === "published" ? null : (
          <Button type="submit" name="intent" value="publish">
            {s.saveAndPublish}
          </Button>
        )}
      </div>
    </form>
  );
}
