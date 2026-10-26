import type { ChallengeInput } from "@/lib/api/marketplace-authoring";

// Reading the challenge form (decision 0112): requirements, constraints and
// the shortlist arrive one per line, a requirement's target follows a pipe,
// and a weight is 0 to 5 per criterion. Pure, so a test can hold it to that.
const CRITERIA = [
  "cost",
  "strength",
  "stiffness",
  "toughness",
  "temperature",
  "corrosion",
  "uv",
  "embodied_energy",
  "carbon",
  "recyclability",
  "lead",
] as const;

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseChallengeForm(formData: FormData, status: "draft" | "published"): ChallengeInput {
  const weights: Record<string, number> = {};
  for (const key of CRITERIA) {
    const weight = Number(formData.get(`weight-${key}`) ?? 0);
    if (Number.isInteger(weight) && weight > 0) weights[key] = Math.min(weight, 5);
  }
  return {
    title: String(formData.get("title") ?? "").trim(),
    context: String(formData.get("context") ?? "").trim(),
    requirements: lines(formData.get("requirements")).map((line) => {
      const [text, ...rest] = line.split("|");
      return { text: (text ?? "").trim(), target: rest.join("|").trim() };
    }),
    constraints: lines(formData.get("constraints")),
    deliverable: String(formData.get("deliverable") ?? "").trim(),
    weights,
    candidate_families: String(formData.get("candidate_families") ?? "").trim(),
    shortlist: lines(formData.get("shortlist")).map((sku) => sku.toUpperCase()),
    status,
  };
}

