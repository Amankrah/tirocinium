import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { listChallenges } from "@/lib/api/marketplace";
import { requireSeat } from "@/lib/seat-session";
import { strings } from "../../strings";

// Every challenge a seat can work (decision 0112): the catalogue's briefs as
// a seeded library and the course's own published challenges, each saying
// whether this seat has committed a selection. Nothing on this page names a
// material: the list is requirements, not answers.
export default async function ChallengesPage() {
  const { token } = await requireSeat();
  const s = strings.marketplace;
  const p = strings.project;
  const challenges = await listChallenges(token);
  if (!challenges.ok) throw new Error(s.offline);

  return (
    <>
      <nav aria-label={p.breadcrumb} className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link
          href="/marketplace"
          className="rounded-sm transition-colors duration-(--motion-duration) ease-(--motion-ease) hover:text-ink focus-ring"
        >
          {p.home}
        </Link>
        <Icon name="chevron-right" size={14} />
        <span className="text-ink">{p.briefs}</span>
      </nav>
      <PageHeader title={p.challengesTitle} description={p.challengesLede} />
      <ul className="grid gap-4 md:grid-cols-2">
        {challenges.data.map((challenge) => (
          <Card
            key={challenge.key}
            as="li"
            className="flex flex-col gap-3 transition-[border-color,box-shadow] duration-(--motion-duration) ease-(--motion-ease) hover:border-ink hover:shadow-floating"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={challenge.source === "course" ? "accent" : undefined}>
                {challenge.source === "course" ? p.fromCourse : p.fromCatalogue}
              </Badge>
              {challenge.committed ? (
                <Badge mono>
                  <Icon name="check" size={12} />
                  {challenge.reference}
                </Badge>
              ) : null}
            </div>
            <Link
              href={`/marketplace/challenges/${encodeURIComponent(challenge.key)}`}
              className="font-display text-xl leading-snug text-ink hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
            >
              {challenge.title}
            </Link>
            <p className="mt-auto border-t border-rule-line pt-3 font-mono text-xs tabular-nums text-ink-muted">
              {p.requirementCount(challenge.requirement_count)} ·{" "}
              {challenge.committed ? p.committedAs(challenge.reference ?? "") : p.notCommitted}
            </p>
          </Card>
        ))}
      </ul>
    </>
  );
}
