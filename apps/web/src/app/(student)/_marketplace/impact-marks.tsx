import type { LineSummary } from "@/lib/api/marketplace";

import { impactQuantity } from "./impact-format";

// The two figures a card can carry without becoming a data sheet: energy and
// carbon. Hidden when this catalogue version has no carbon layer, so an
// earlier version's card stays as it was. A process is per unit of process;
// a material is per kilogram.
export function ImpactMarks({ line }: { line: LineSummary }) {
  const process = line.process_energy_mj != null || line.process_carbon_kg != null;
  const layered = process || line.carbon_kg_co2e != null;
  if (!layered) return null;

  const marks: { key: string; text: string }[] = [];
  if (process) {
    if (line.process_energy_mj != null) {
      marks.push({
        key: "energy",
        text: `${impactQuantity(line.process_energy_mj, 1)} MJ/${line.unit_label}`,
      });
    }
    if (line.process_carbon_kg != null) {
      marks.push({
        key: "carbon",
        text: `${impactQuantity(line.process_carbon_kg, 2)} kg CO₂e/${line.unit_label}`,
      });
    }
  } else {
    if (line.embodied_energy_mj_kg != null) {
      marks.push({
        key: "energy",
        text: `${impactQuantity(line.embodied_energy_mj_kg, 1)} MJ/kg`,
      });
    }
    if (line.carbon_kg_co2e != null) {
      marks.push({
        key: "carbon",
        text: `${impactQuantity(line.carbon_kg_co2e, 2)} kg CO₂e/kg`,
      });
    }
  }
  if (marks.length === 0) return null;

  return (
    <p className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs tabular-nums text-ink-muted">
      {marks.map((mark) => (
        <span key={mark.key}>{mark.text}</span>
      ))}
    </p>
  );
}
