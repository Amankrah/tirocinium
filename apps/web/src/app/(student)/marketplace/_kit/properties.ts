import type { LineDetail } from "@/lib/api/marketplace";

// The material data sheet (decision 0101): every property the catalogue
// carries, in the order the BREE 216 prototype set it out, with its unit and
// how it reads. A figure the catalogue does not hold is left off the sheet
// rather than shown as zero, because a zero is a measurement and an absence
// is not (the catalogue loads "does not apply" as null for that reason).

type Properties = LineDetail["properties"];
type Key = keyof Properties;

export type PropertyRow = { label: string; value: string };

const STAR = "★";
const EMPTY = "☆";

function number(value: number): string {
  return value.toLocaleString("en-CA", { maximumFractionDigits: 2 });
}

function rating(value: number): string {
  return `${STAR.repeat(value)}${EMPTY.repeat(Math.max(0, 5 - value))} (${value} of 5)`;
}

const SHEET: { key: Key; label: string; unit?: string; read?: (value: never) => string }[] = [
  { key: "density_kg_m3", label: "Density", unit: "kg/m³" },
  { key: "yield_strength_mpa", label: "Yield strength", unit: "MPa" },
  { key: "tensile_strength_mpa", label: "Tensile strength", unit: "MPa" },
  { key: "youngs_modulus_gpa", label: "Young's modulus", unit: "GPa" },
  { key: "elongation_percent", label: "Elongation at break", unit: "%" },
  { key: "fracture_toughness_mpa_m05", label: "Fracture toughness", unit: "MPa·m½" },
  { key: "hardness", label: "Hardness", read: (value: string) => value },
  { key: "thermal_conductivity_w_mk", label: "Thermal conductivity", unit: "W/m·K" },
  { key: "thermal_expansion_um_mk", label: "Thermal expansion", unit: "µm/m·K" },
  { key: "max_service_temp_c", label: "Max service temperature", unit: "°C" },
  { key: "corrosion_resistance", label: "Corrosion resistance", read: rating },
  { key: "uv_resistance", label: "UV resistance", read: rating },
  { key: "food_contact", label: "Food-contact approved", read: (value: boolean) => (value ? "Yes" : "No") },
  { key: "embodied_energy_mj_kg", label: "Embodied energy", unit: "MJ/kg" },
  { key: "recyclability_percent", label: "Recyclability", unit: "%" },
];

export const PROPERTY_COUNT = SHEET.length;

export function dataSheet(properties: Properties, service: boolean): PropertyRow[] {
  const rows: PropertyRow[] = [];
  for (const entry of SHEET) {
    const value = properties[entry.key];
    if (value === null || value === undefined) {
      // A material with a tensile strength but no yield point is brittle,
      // and saying so is the useful reading of the gap.
      if (entry.key === "yield_strength_mpa" && !service && properties.tensile_strength_mpa) {
        rows.push({ label: entry.label, value: "None (brittle, no yield point)" });
      }
      continue;
    }
    const read = entry.read as ((value: unknown) => string) | undefined;
    const shown = read
      ? read(value)
      : `${number(value as number)}${entry.unit ? ` ${entry.unit}` : ""}`;
    rows.push({ label: entry.label, value: shown });
  }
  return rows;
}
