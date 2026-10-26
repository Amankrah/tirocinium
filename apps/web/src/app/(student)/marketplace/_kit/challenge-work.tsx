"use client";

// The work a student does on a challenge (decision 0112): the candidates
// (the comparison tray, which already holds up to five lines), the weighting,
// the matrix the server scores from it, the quote they built, and the commit
// that stores the three together and earns the reveal.
//
// Nothing is scored here. Every change to a weight goes to the server, which
// returns the matrix, so the figures on the page and the figures stored with
// the selection are the same ones. A committed selection comes back inside
// the challenge, and the page is refreshed so the reveal is server-rendered
// from the same read a reload would make.
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SectionHeading } from "@/components/ui/section-heading";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import type { Challenge, Matrix, Result, SelectionRequest } from "@/lib/api/marketplace";
import { money } from "@/lib/money";
import { strings } from "../../strings";
import { useMarket } from "./market-state";

const MIN_CANDIDATES = 2;
const MAX_WEIGHT = 5;

export function ChallengeWork({
  challenge,
  score,
  commit,
}: {
  challenge: Challenge;
  score: (skus: string[], weights: Record<string, number>) => Promise<Result<Matrix>>;
  commit: (key: string, request: SelectionRequest) => Promise<Result<Challenge>>;
}) {
  const s = strings.marketplace;
  const p = strings.project;
  const router = useRouter();
  const market = useMarket();
  const { tray, basket, quotation } = market;
  const committed = challenge.selection;

  // Start from what was committed, else from the author's suggestion, else
  // from nothing. A weight the author did not mention starts at zero.
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    committed ? committed.weights : challenge.weights,
  );
  const [matrix, setMatrix] = useState<Matrix | null>(committed?.matrix ?? null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [scoring, startScoring] = useTransition();
  const [committing, startCommitting] = useTransition();

  const candidates = tray.length >= MIN_CANDIDATES ? tray : (committed?.candidates ?? tray);
  const anyWeight = Object.values(weights).some((weight) => weight > 0);
  const key = `${candidates.join(",")}|${JSON.stringify(weights)}`;

  useEffect(() => {
    if (candidates.length < MIN_CANDIDATES || !anyWeight) return;
    startScoring(async () => {
      const result = await score(candidates, weights);
      if (result.ok) {
        setMatrix(result.data);
        setFailure(null);
      } else {
        setFailure(result.detail || s.offline);
      }
    });
    // `key` stands for the candidates and the weights; the action is a
    // stable server reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const canCommit = candidates.length >= MIN_CANDIDATES && anyWeight && basket.length > 0;

  function onCommit() {
    startCommitting(async () => {
      const result = await commit(challenge.key, {
        candidates,
        weights,
        lines: basket,
      });
      if (result.ok && result.data.selection) {
        setDone(result.data.selection.reference);
        setFailure(null);
        router.refresh();
      } else {
        setFailure(result.ok ? s.offline : result.detail || s.offline);
      }
    });
  }

  return (
    <section aria-labelledby="work" aria-busy={scoring || committing} className="flex flex-col gap-8">
      <SectionHeading id="work" title={p.howToWork} />
      <ol className="flex max-w-[var(--measure-reading)] list-decimal flex-col gap-1.5 pl-6 text-sm">
        {p.howToWorkSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl">{p.yourCandidates}</h3>
        <p className="text-sm text-ink-muted">{p.candidatesFromTray(candidates.length)}</p>
        {candidates.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {candidates.map((sku) => (
              <li key={sku} className="rounded-md border border-rule-line px-2.5 py-1 font-mono text-xs">
                {sku}
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <ButtonLink href="/marketplace/search" variant="secondary" size="sm">
            <Icon name="grid" size={14} />
            {p.browseForCandidates}
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl">{p.weighting}</h3>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.weightingHint}</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {challenge.criteria.map((criterion) => {
            const id = `weight-${criterion.key}`;
            const value = weights[criterion.key] ?? 0;
            return (
              <li key={criterion.key} className="flex flex-col gap-1 rounded-lg border border-rule-line px-4 py-3">
                <label htmlFor={id} className="flex items-center justify-between text-sm">
                  <span>{criterion.label}</span>
                  <span className="font-mono text-xs tabular-nums text-ink-muted">{value}</span>
                </label>
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={MAX_WEIGHT}
                  step={1}
                  value={value}
                  aria-label={p.weightOf(criterion.label)}
                  aria-valuetext={String(value)}
                  onChange={(event) => {
                    // Read before the updater runs: React has released the
                    // event by then and currentTarget is gone.
                    const next = Number(event.currentTarget.value);
                    setWeights((current) => ({ ...current, [criterion.key]: next }));
                  }}
                  className="accent-(--color-accent)"
                />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl">{p.matrixHeading}</h3>
        <p className="max-w-[var(--measure-reading)] text-sm text-ink-muted">{p.matrixHint}</p>
        {failure ? (
          <p role="alert" className="text-sm text-flag-amber">
            {failure}
          </p>
        ) : null}
        {matrix && candidates.length >= MIN_CANDIDATES && anyWeight ? (
          <MatrixTable matrix={matrix} />
        ) : (
          <p className="text-sm text-ink-muted">
            {candidates.length < MIN_CANDIDATES ? p.candidatesFromTray(candidates.length) : p.matrixWaiting}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-display text-xl">{p.yourBasket}</h3>
        {basket.length === 0 ? (
          <p className="text-sm text-ink-muted">{p.basketEmpty}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            {p.basketLines(basket.length)}
            {quotation ? ` · ${p.selectionQuotedTotal(money(quotation.totals.total_cents))}` : ""}
          </p>
        )}
        <div>
          <ButtonLink href="/marketplace/quote" variant="secondary" size="sm">
            <Icon name="file" size={14} />
            {p.quoteLink(basket.length)}
          </ButtonLink>
        </div>
      </div>

      <Card as="div" className="flex flex-col gap-3">
        {!canCommit ? <p className="text-sm text-ink-muted">{p.commitNeeds}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onCommit} disabled={!canCommit || committing}>
            {committing ? p.committing : committed ? p.recommit : p.commit}
            {committing ? null : <Icon name="arrow-right" size={14} />}
          </Button>
          {done ? (
            <p role="status" className="text-sm">
              {p.committed(done)}
            </p>
          ) : committed ? (
            <p className="text-sm text-ink-muted">{p.committedAs(committed.reference)}</p>
          ) : null}
        </div>
      </Card>
    </section>
  );
}

function MatrixTable({ matrix }: { matrix: Matrix }) {
  const p = strings.project;
  const scoreOf = new Map(matrix.scores.map((score) => [score.sku, score]));
  return (
    <Table>
      <thead>
        <tr>
          <Th>{p.matrixCriterion}</Th>
          <Th justify="end">{p.matrixWeight}</Th>
          {matrix.skus.map((sku) => (
            <Th key={sku} justify="end">
              <span className="font-mono normal-case">{sku}</span>
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.criteria.map((criterion) => (
          <Tr key={criterion.key}>
            <Td>{criterion.label}</Td>
            <Td justify="end" numeric>
              {criterion.weight}
            </Td>
            {criterion.cells.map((cell) => (
              <Td key={cell.sku} justify="end" numeric>
                {cell.display}
                <span className="block text-xs text-ink-muted">
                  {cell.normalised === null ? "–" : cell.normalised.toFixed(2)}
                </span>
              </Td>
            ))}
          </Tr>
        ))}
        <Tr>
          <Td className="font-medium">{p.matrixScore}</Td>
          <Td />
          {matrix.skus.map((sku) => {
            const score = scoreOf.get(sku);
            return (
              <Td key={sku} justify="end" numeric className="font-medium">
                {score ? `${score.score} %` : "–"}
                {score ? (
                  <span className="block text-xs font-normal text-ink-muted">
                    {p.matrixRank(score.rank)}
                    {score.missing.length > 0 ? ` · ${p.matrixMissing(score.missing.join(", "))}` : ""}
                  </span>
                ) : null}
              </Td>
            );
          })}
        </Tr>
      </tbody>
    </Table>
  );
}
