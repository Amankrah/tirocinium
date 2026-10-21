// The four course reports (guide 8, milestone 8.3). All Server Components:
// these are dense reads with no interaction, so the route ships zero client
// JavaScript and the tables are ordinary tables.
//
// Two rules run through every view. A null is not a zero: an empty denominator
// reports null (decision 0048) and renders as "Not enough yet", never as a
// figure that would read like a finding. And nothing ranks: activity is ordered
// by seat number, as the backend returns it, because a report sorted by who did
// most is the per-seat ranking the mastery spec rules out.
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Stat } from "@/components/ui/stat";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { Schemas } from "@/lib/api/client";
import { strings } from "../../../strings";

const s = strings.reports;

function formatDate(at: number): string {
  return new Date(at * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// One place decides how a maybe-absent statistic reads, so no view can
// accidentally print a zero for "we cannot say".
function stat(value: number | null, render: (v: number) => string): string {
  return value === null ? s.notEnoughData : render(value);
}

const SUBHEADING = "text-xs font-medium tracking-wide text-ink-muted uppercase";

export function ActivityReport({ activity }: { activity: Schemas["ActivityOut"] }) {
  if (activity.seats.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <SectionHeading title={s.activityHeading} />
        <EmptyState icon="users" body={s.activityEmpty} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading title={s.activityHeading} description={s.activityNote} />
      <p className="font-display text-xl tabular-nums">
        {s.activitySummary(activity.active_seats, activity.seat_count)}
      </p>
      <Table>
        <thead>
          <tr>
            <Th>{s.colSeat}</Th>
            <Th>{s.colStatus}</Th>
            <Th justify="end">{s.colSubmissions}</Th>
            <Th justify="end">{s.colGraded}</Th>
            <Th justify="end">{s.colDefences}</Th>
            <Th>{s.colLastSubmitted}</Th>
          </tr>
        </thead>
        <tbody>
          {activity.seats.map((seat) => (
            <Tr key={seat.seat_number}>
              <th
                scope="row"
                className="border-b border-rule-line px-3.5 py-3 text-start align-top font-mono font-medium tabular-nums"
              >
                {seat.seat_number}
              </th>
              <Td>
                <Badge tone={seat.status === "active" ? "green" : "amber"}>{seat.status}</Badge>
              </Td>
              <Td numeric justify="end">
                {seat.submissions}
              </Td>
              <Td numeric justify="end">
                {seat.graded}
              </Td>
              <Td numeric justify="end">
                {seat.defences}
              </Td>
              <Td className="text-ink-muted">
                {seat.last_submitted_at === null
                  ? s.never
                  : formatDate(seat.last_submitted_at)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
}

export function UsageReport({ usage }: { usage: Schemas["UsageOut"] }) {
  const empty = usage.tokens.length === 0 && usage.speech.length === 0;

  return (
    <section className="flex flex-col gap-4">
      {/* A price nobody configured is not a price of zero (decision 0048). */}
      <SectionHeading
        title={s.usageHeading}
        description={!usage.priced ? s.usageUnpriced : undefined}
      />

      {empty ? (
        <EmptyState icon="chart" body={s.usageEmpty} />
      ) : (
        <>
          <p className="font-display text-xl tabular-nums">
            {s.usageTotals(usage.total_input_tokens, usage.total_output_tokens)}
          </p>

          {usage.tokens.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className={SUBHEADING}>{s.usageTokens}</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>{s.colKind}</Th>
                    <Th>{s.colModel}</Th>
                    <Th justify="end">{s.colCalls}</Th>
                    <Th justify="end">{s.colInput}</Th>
                    <Th justify="end">{s.colOutput}</Th>
                    <Th justify="end">{s.colCost}</Th>
                  </tr>
                </thead>
                <tbody>
                  {usage.tokens.map((row) => (
                    <Tr key={`${row.kind}-${row.model_id}`}>
                      <Td>{row.kind}</Td>
                      <Td className="font-mono text-xs">{row.model_id}</Td>
                      <Td numeric justify="end">
                        {row.calls}
                      </Td>
                      <Td numeric justify="end">
                        {row.input_tokens.toLocaleString("en-GB")}
                      </Td>
                      <Td numeric justify="end">
                        {row.output_tokens.toLocaleString("en-GB")}
                      </Td>
                      <Td numeric justify="end" className="text-ink-muted">
                        {row.cost === null ? s.notPriced : row.cost.toFixed(2)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}

          {usage.speech.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className={SUBHEADING}>{s.usageSpeech}</h3>
              <Table>
                <thead>
                  <tr>
                    <Th>{s.colKind}</Th>
                    <Th>{s.colProvider}</Th>
                    <Th justify="end">{s.colCalls}</Th>
                    <Th justify="end">{s.colAmount}</Th>
                    <Th justify="end">{s.colCost}</Th>
                  </tr>
                </thead>
                <tbody>
                  {usage.speech.map((row) => (
                    <Tr key={`${row.kind}-${row.provider}`}>
                      <Td>{row.kind}</Td>
                      <Td className="font-mono text-xs">{row.provider}</Td>
                      <Td numeric justify="end">
                        {row.calls}
                      </Td>
                      <Td numeric justify="end">
                        {row.amount.toLocaleString("en-GB")} {row.unit}
                      </Td>
                      <Td numeric justify="end" className="text-ink-muted">
                        {row.cost === null ? s.notPriced : row.cost.toFixed(2)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function HealthReport({
  health,
}: {
  health: Schemas["app__reports__routes__HealthOut"];
}) {
  const { recognition, verification } = health;
  const busiest = Math.max(1, ...recognition.buckets.map((b) => b.count));

  return (
    <section className="flex flex-col gap-6">
      <SectionHeading title={s.healthHeading} />

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-3">
          <h3 className={SUBHEADING}>{s.recognitionHeading}</h3>
          {recognition.pages_read === 0 ? (
            <p className="text-sm text-ink-muted">{s.recognitionEmpty}</p>
          ) : (
            <>
              <p className="font-display text-xl tabular-nums">
                {stat(recognition.mean_confidence, (mean) =>
                  s.recognitionSummary(mean, recognition.pages_read),
                )}
              </p>
              {/* Hairline bars from the token layer rather than a charting
                  dependency: the design language organises with rules and
                  margins, and this earns no new bundle (guide 3.2, guide 5). */}
              <ul className="flex flex-col gap-1.5 rounded-lg bg-surface-sunken p-4">
                {recognition.buckets.map((bucket) => (
                  <li key={bucket.lower} className="flex items-center gap-3 text-xs">
                    <span className="w-24 shrink-0 font-mono tabular-nums text-ink-muted">
                      {s.bucketLabel(bucket.lower, bucket.upper)}
                    </span>
                    <span className="flex h-3 flex-1 items-center">
                      <span
                        aria-hidden="true"
                        className="block h-full rounded-sm bg-accent/70"
                        style={{ width: `${(bucket.count / busiest) * 100}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-end font-mono tabular-nums text-ink-muted">
                      {s.bucketCount(bucket.count)}
                    </span>
                  </li>
                ))}
              </ul>
              {recognition.rejected_pages > 0 ? (
                <p className="text-sm text-flag-amber">
                  {s.recognitionRejected(recognition.rejected_pages)}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className={SUBHEADING}>{s.verificationHeading}</h3>
          {verification.pass_rate === null ? (
            <p className="text-sm text-ink-muted">{s.verificationNone}</p>
          ) : (
            <p className="font-display text-3xl tabular-nums leading-none">
              {s.verificationRate(verification.pass_rate)}
            </p>
          )}
          <p className="text-sm text-ink-muted">
            {s.verificationCounts(
              verification.verified,
              verification.flagged,
              verification.manual,
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

export function AgreementReport({
  agreement,
}: {
  agreement: Schemas["RubricAgreementOut"];
}) {
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const signed = (v: number) =>
    `${v > 0 ? "+" : ""}${Math.round(v * 100)} points`;

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading
        title={s.agreementHeading}
        count={s.agreementPairs(agreement.pairs)}
        description={s.agreementNote}
      />
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={s.agreementMeanGrade} value={stat(agreement.mean_grade, percent)} />
        <Stat
          label={s.agreementMeanRubric}
          value={stat(agreement.mean_rubric_score, percent)}
        />
        <Stat
          label={s.agreementBias}
          value={stat(agreement.mean_signed_difference, signed)}
          hint={
            agreement.mean_signed_difference === null
              ? undefined
              : s.agreementBiasNote(agreement.mean_signed_difference)
          }
        />
        <Stat
          label={s.agreementSpread}
          value={stat(agreement.mean_absolute_difference, signed)}
        />
        <Stat
          label={s.agreementCorrelation}
          value={stat(agreement.correlation, (v) => v.toFixed(2))}
        />
      </div>
    </section>
  );
}
