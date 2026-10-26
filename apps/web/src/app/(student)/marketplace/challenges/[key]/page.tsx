import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { getChallenge } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../../strings";
import { commitSelectionAction, matrixAction } from "../../actions";
import { ChallengeWork } from "../../_kit/challenge-work";
import { LineGrid } from "../../_kit/line-card";

// One challenge (decision 0112). The requirements statement is HTML and is
// all a student meets on arrival: no family, no shortlist. The work (the
// candidates from the comparison tray, the weighting, the scored matrix, the
// quote) is the client island below it, and the reveal is server-rendered
// only once the backend says a selection has been committed, so the answer
// never travels to a page that has not earned it.
export default async function ChallengePage({ params }: { params: Promise<{ key: string }> }) {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const { key } = await params;
  const found = await getChallenge(token, decodeURIComponent(key));
  if (!found.ok) {
    if (found.status === 404) notFound();
    throw new Error(s.offline);
  }
  const challenge = found.data;
  const crumb =
    "rounded-sm transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring";

  return (
    <>
      <nav aria-label={p.breadcrumb} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link href="/marketplace" className={crumb}>
          {p.home}
        </Link>
        <Icon name="chevron-right" size={14} />
        <Link href="/marketplace/challenges" className={crumb}>
          {p.briefs}
        </Link>
        <Icon name="chevron-right" size={14} />
        <span className="text-ink">{challenge.title}</span>
      </nav>

      <header className="flex flex-col gap-4">
        <div>
          <Badge tone={challenge.source === "course" ? "accent" : undefined}>
            {challenge.source === "course" ? p.fromCourse : p.fromCatalogue}
          </Badge>
        </div>
        <h1 className="max-w-[24ch] font-display text-4xl leading-[1.05]">{challenge.title}</h1>
        {challenge.context ? (
          <p className="max-w-[var(--measure-reading)] text-pretty">{challenge.context}</p>
        ) : null}
      </header>

      <section aria-labelledby="requirements" className="flex flex-col gap-5">
        <SectionHeading id="requirements" title={p.challengeRequirements} />
        <ol className="flex max-w-[var(--measure-reading)] list-decimal flex-col gap-3 pl-6">
          {challenge.requirements.map((requirement, index) => (
            <li key={index} className="flex flex-col gap-0.5">
              <span>{requirement.text}</span>
              {requirement.target ? (
                <span className="font-mono text-xs text-ink-muted">
                  {p.challengeTarget}: {requirement.target}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
        {challenge.constraints.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{p.challengeConstraints}</h3>
            <ul className="flex max-w-[var(--measure-reading)] list-disc flex-col gap-1 pl-6 text-sm">
              {challenge.constraints.map((constraint) => (
                <li key={constraint}>{constraint}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <Card tone="sunken" className="flex max-w-[var(--measure-reading)] gap-3 text-sm">
          <Icon name="file" size={16} className="mt-0.5 shrink-0 text-ink-muted" />
          <p>
            <strong className="font-medium">{p.challengeDeliverable}</strong> {challenge.deliverable}
          </p>
        </Card>
      </section>

      <ChallengeWork
        challenge={challenge}
        score={matrixAction}
        commit={commitSelectionAction}
      />

      {challenge.reveal ? (
        <section aria-labelledby="reveal" className="flex flex-col gap-5">
          <SectionHeading id="reveal" title={p.revealHeading} description={p.revealLede} />
          {challenge.reveal.candidate_families ? (
            <p className="max-w-[var(--measure-reading)]">
              <span className="font-medium">{p.revealFamilies}</span>{" "}
              {challenge.reveal.candidate_families}
            </p>
          ) : null}
          <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">
            {p.revealAgreement(
              challenge.reveal.agreement.length,
              challenge.selection?.candidates.length ?? 0,
            )}
          </p>
          {challenge.reveal.shortlist.length > 0 ? (
            <LineGrid lines={challenge.reveal.shortlist} />
          ) : null}
        </section>
      ) : null}
    </>
  );
}
