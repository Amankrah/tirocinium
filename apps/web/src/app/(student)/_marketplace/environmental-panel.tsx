import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import type { LineDetail } from "@/lib/api/marketplace";

import { strings } from "../strings";
import { impactQuantity } from "./impact-format";

// The line's environmental layer (decision 0110). Every number and every band
// arrives computed. This draws them. A catalogue version without the layer
// has nothing here, and the data sheet's embodied energy and recyclability
// remain the figures that version does publish.
export function hasEnvironmentalLayer(line: LineDetail): boolean {
  const impact = line.impact;
  return (
    impact.carbon_kg_co2e != null ||
    impact.water_l_kg != null ||
    impact.end_of_life_recovery_percent != null ||
    impact.process_energy_mj != null ||
    impact.process_carbon_kg != null ||
    impact.end_of_life !== ""
  );
}

export function EnvironmentalPanel({ line }: { line: LineDetail }) {
  const p = strings.project;
  const impact = line.impact;
  const process = impact.process_energy_mj != null || impact.process_carbon_kg != null;
  const supplied = perUnit(line);

  return (
    <section aria-labelledby="impact" className="flex flex-col gap-4">
      <SectionHeading id="impact" title={p.impactHeading} />
      <p className="max-w-[var(--measure-reading)] text-sm text-pretty text-ink-muted">
        {process ? p.impactProcessLede : p.impactLede}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {process ? (
          <>
            {impact.process_energy_mj != null ? (
              <Tile
                label={p.impactEnergy}
                value={impactQuantity(impact.process_energy_mj, 1)}
                unit={`MJ/${line.unit_label}`}
              />
            ) : null}
            {impact.process_carbon_kg != null ? (
              <Tile
                label={p.impactCarbon}
                value={impactQuantity(impact.process_carbon_kg, 2)}
                unit={`kg CO₂e/${line.unit_label}`}
              />
            ) : null}
          </>
        ) : (
          <>
            {impact.embodied_energy_mj_kg != null ? (
              <Tile
                label={p.impactEnergy}
                value={impactQuantity(impact.embodied_energy_mj_kg, 1)}
                unit="MJ/kg"
                band={impact.embodied_energy_band}
              />
            ) : null}
            {impact.carbon_kg_co2e != null ? (
              <Tile
                label={p.impactCarbon}
                value={impactQuantity(impact.carbon_kg_co2e, 2)}
                unit="kg CO₂e/kg"
                band={impact.carbon_band}
              />
            ) : null}
            {impact.water_l_kg != null ? (
              <Tile
                label={p.impactWater}
                value={impactQuantity(impact.water_l_kg, 0)}
                unit="L/kg"
                band={impact.water_band}
              />
            ) : null}
            {impact.end_of_life_recovery_percent != null ? (
              <Tile
                label={p.impactRecovery}
                value={impactQuantity(impact.end_of_life_recovery_percent, 0)}
                unit="%"
                band={impact.recovery_band}
              />
            ) : null}
          </>
        )}
      </dl>
      {impact.end_of_life_recovery_percent != null ? (
        <p className="max-w-[var(--measure-reading)] text-sm text-pretty text-ink-muted">
          {p.impactRecoveryNote}
        </p>
      ) : null}
      {supplied ? (
        <p className="max-w-[var(--measure-reading)] text-sm">{supplied}</p>
      ) : null}
      {impact.min_service_temp_c != null ? (
        <p className="text-sm">
          {p.impactMinTemp(`${impactQuantity(impact.min_service_temp_c, 0)} °C`)}
        </p>
      ) : null}
      {impact.end_of_life ? (
        <Card tone="sunken" className="max-w-[var(--measure-reading)] text-sm">
          <p>
            <strong className="font-medium">{p.impactEndOfLife}</strong> {impact.end_of_life}
          </p>
        </Card>
      ) : null}
      {impact.process_note ? (
        <Card tone="sunken" className="max-w-[var(--measure-reading)] text-sm">
          <p>{impact.process_note}</p>
        </Card>
      ) : null}
      <p className="text-sm">
        <Link
          href="/marketplace/impact"
          className="text-accent-text underline-offset-2 hover:underline focus-ring rounded-sm"
        >
          {p.impactMore}
        </Link>
      </p>
    </section>
  );
}

function Tile({
  label,
  value,
  unit,
  band,
}: {
  label: string;
  value: string;
  unit: string;
  band?: string | null;
}) {
  return (
    <div className="rounded-lg border border-rule-line px-3 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-mono text-lg tabular-nums">{value}</dd>
      <p className="text-xs text-ink-muted">{band ? `${unit} · ${band}` : unit}</p>
    </div>
  );
}

function perUnit(line: LineDetail): string | null {
  if (line.unit === "kg") return null;
  const impact = line.impact;
  const parts: string[] = [];
  if (impact.energy_per_unit != null) parts.push(`${impactQuantity(impact.energy_per_unit, 1)} MJ`);
  if (impact.carbon_per_unit != null) {
    parts.push(`${impactQuantity(impact.carbon_per_unit, 2)} kg CO₂e`);
  }
  if (impact.water_per_unit != null) parts.push(`${impactQuantity(impact.water_per_unit, 0)} L`);
  if (parts.length === 0) return null;
  return strings.project.perUnitAsSupplied(line.unit_label, parts.join(", "));
}
