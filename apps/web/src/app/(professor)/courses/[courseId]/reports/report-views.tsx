// The four course reports (guide 8, milestone 8.3). All Server Components:
// these are dense reads with no interaction, so the route ships zero client
// JavaScript and the tables are ordinary tables.
//
// Two rules run through every view. A null is not a zero: an empty denominator
// reports null (decision 0048) and renders as "Not enough yet", never as a
// figure that would read like a finding. And nothing ranks: activity is ordered
// by seat number, as the backend returns it, because a report sorted by who did
// most is the per-seat ranking the mastery spec rules out.
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

const cell = "px-3 py-2 text-left";
const head = `${cell} text-xs font-normal uppercase tracking-widest text-ink-muted`;

export function ActivityReport({ activity }: { activity: Schemas["ActivityOut"] }) {
  if (activity.seats.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{s.activityHeading}</h2>
        <p className="text-ink-muted">{s.activityEmpty}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">{s.activityHeading}</h2>
      <p className="text-sm text-ink-muted">
        {s.activitySummary(activity.active_seats, activity.seat_count)}
      </p>
      <p className="text-xs text-ink-muted">{s.activityNote}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule-line">
              <th scope="col" className={head}>{s.colSeat}</th>
              <th scope="col" className={head}>{s.colStatus}</th>
              <th scope="col" className={head}>{s.colSubmissions}</th>
              <th scope="col" className={head}>{s.colGraded}</th>
              <th scope="col" className={head}>{s.colDefences}</th>
              <th scope="col" className={head}>{s.colLastSubmitted}</th>
            </tr>
          </thead>
          <tbody>
            {activity.seats.map((seat) => (
              <tr key={seat.seat_number} className="border-b border-rule-line">
                <th scope="row" className={`${cell} font-mono font-normal tabular-nums`}>
                  {seat.seat_number}
                </th>
                <td className={`${cell} text-ink-muted`}>{seat.status}</td>
                <td className={`${cell} tabular-nums`}>{seat.submissions}</td>
                <td className={`${cell} tabular-nums`}>{seat.graded}</td>
                <td className={`${cell} tabular-nums`}>{seat.defences}</td>
                <td className={`${cell} text-ink-muted`}>
                  {seat.last_submitted_at === null
                    ? s.never
                    : formatDate(seat.last_submitted_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function UsageReport({ usage }: { usage: Schemas["UsageOut"] }) {
  const empty = usage.tokens.length === 0 && usage.speech.length === 0;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">{s.usageHeading}</h2>
      {/* A price nobody configured is not a price of zero (decision 0048). */}
      {!usage.priced ? <p className="text-sm text-ink-muted">{s.usageUnpriced}</p> : null}

      {empty ? (
        <p className="text-ink-muted">{s.usageEmpty}</p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {s.usageTotals(usage.total_input_tokens, usage.total_output_tokens)}
          </p>

          {usage.tokens.length > 0 ? (
            <div className="overflow-x-auto">
              <h3 className="pb-1 text-xs uppercase tracking-widest text-ink-muted">
                {s.usageTokens}
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-rule-line">
                    <th scope="col" className={head}>{s.colKind}</th>
                    <th scope="col" className={head}>{s.colModel}</th>
                    <th scope="col" className={head}>{s.colCalls}</th>
                    <th scope="col" className={head}>{s.colInput}</th>
                    <th scope="col" className={head}>{s.colOutput}</th>
                    <th scope="col" className={head}>{s.colCost}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.tokens.map((row) => (
                    <tr
                      key={`${row.kind}-${row.model_id}`}
                      className="border-b border-rule-line"
                    >
                      <td className={cell}>{row.kind}</td>
                      <td className={`${cell} font-mono text-xs`}>{row.model_id}</td>
                      <td className={`${cell} tabular-nums`}>{row.calls}</td>
                      <td className={`${cell} tabular-nums`}>
                        {row.input_tokens.toLocaleString("en-GB")}
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        {row.output_tokens.toLocaleString("en-GB")}
                      </td>
                      <td className={`${cell} tabular-nums text-ink-muted`}>
                        {row.cost === null ? s.notPriced : row.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {usage.speech.length > 0 ? (
            <div className="overflow-x-auto">
              <h3 className="pb-1 text-xs uppercase tracking-widest text-ink-muted">
                {s.usageSpeech}
              </h3>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-rule-line">
                    <th scope="col" className={head}>{s.colKind}</th>
                    <th scope="col" className={head}>{s.colProvider}</th>
                    <th scope="col" className={head}>{s.colCalls}</th>
                    <th scope="col" className={head}>{s.colAmount}</th>
                    <th scope="col" className={head}>{s.colCost}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.speech.map((row) => (
                    <tr
                      key={`${row.kind}-${row.provider}`}
                      className="border-b border-rule-line"
                    >
                      <td className={cell}>{row.kind}</td>
                      <td className={`${cell} font-mono text-xs`}>{row.provider}</td>
                      <td className={`${cell} tabular-nums`}>{row.calls}</td>
                      <td className={`${cell} tabular-nums`}>
                        {row.amount.toLocaleString("en-GB")} {row.unit}
                      </td>
                      <td className={`${cell} tabular-nums text-ink-muted`}>
                        {row.cost === null ? s.notPriced : row.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      <h2 className="font-display text-2xl">{s.healthHeading}</h2>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs uppercase tracking-widest text-ink-muted">
          {s.recognitionHeading}
        </h3>
        {recognition.pages_read === 0 ? (
          <p className="text-ink-muted">{s.recognitionEmpty}</p>
        ) : (
          <>
            <p className="text-sm text-ink">
              {stat(recognition.mean_confidence, (mean) =>
                s.recognitionSummary(mean, recognition.pages_read),
              )}
            </p>
            {/* Hairline bars from the token layer rather than a charting
                dependency: the design language organises with rules and
                margins, and this earns no new bundle (guide 3.2, guide 5). */}
            <ul className="flex flex-col gap-1">
              {recognition.buckets.map((bucket) => (
                <li key={bucket.lower} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 tabular-nums text-ink-muted">
                    {s.bucketLabel(bucket.lower, bucket.upper)}
                  </span>
                  <span className="flex h-3 flex-1 items-center">
                    <span
                      aria-hidden="true"
                      className="block h-full bg-accent/70"
                      style={{ width: `${(bucket.count / busiest) * 100}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-ink-muted">
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

      <div className="flex flex-col gap-2">
        <h3 className="text-xs uppercase tracking-widest text-ink-muted">
          {s.verificationHeading}
        </h3>
        {verification.pass_rate === null ? (
          <p className="text-ink-muted">{s.verificationNone}</p>
        ) : (
          <p className="text-2xl tabular-nums text-ink">
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
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">{s.agreementHeading}</h2>
      <p className="max-w-prose text-sm text-ink-muted">{s.agreementNote}</p>
      <p className="text-sm text-ink-muted">{s.agreementPairs(agreement.pairs)}</p>
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <Figure label={s.agreementMeanGrade} value={stat(agreement.mean_grade, percent)} />
        <Figure
          label={s.agreementMeanRubric}
          value={stat(agreement.mean_rubric_score, percent)}
        />
        <Figure
          label={s.agreementBias}
          value={stat(agreement.mean_signed_difference, signed)}
          note={
            agreement.mean_signed_difference === null
              ? undefined
              : s.agreementBiasNote(agreement.mean_signed_difference)
          }
        />
        <Figure
          label={s.agreementSpread}
          value={stat(agreement.mean_absolute_difference, signed)}
        />
        <Figure
          label={s.agreementCorrelation}
          value={stat(agreement.correlation, (v) => v.toFixed(2))}
        />
      </dl>
    </section>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-widest text-ink-muted">{label}</dt>
      <dd className="text-xl tabular-nums text-ink">{value}</dd>
      {note ? <p className="text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}
