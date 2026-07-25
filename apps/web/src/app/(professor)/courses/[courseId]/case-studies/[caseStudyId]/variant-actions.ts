"use server";

// The authed calls for preview variants and the flagged review queue (Phase 5.3
// to 5.5), run server-side so the professor JWT never reaches client JavaScript
// (decision 0012).
import type { Schemas } from "@/lib/api/client";
import { requireProfessor } from "@/lib/professor-session";
import {
  deleteVariant,
  editVariant,
  generateVariants,
  getVariant,
  listVariants,
  promoteVariant,
} from "@/lib/api/variants";

export async function generateVariantsAction(
  courseId: number,
  caseStudyId: number,
  count: number,
  idempotencyKey: string,
): Promise<Schemas["GenerateOut"] | null> {
  const { token } = await requireProfessor();
  return generateVariants(token, courseId, caseStudyId, count, idempotencyKey);
}

export async function listVariantsAction(
  courseId: number,
  caseStudyId: number,
  options: { state?: string; cursor?: number; limit?: number } = {},
): Promise<Schemas["VariantListOut"] | null> {
  const { token } = await requireProfessor();
  return listVariants(token, courseId, caseStudyId, options);
}

export async function getVariantAction(
  courseId: number,
  variantId: number,
): Promise<Schemas["VariantDetail"] | null> {
  const { token } = await requireProfessor();
  return getVariant(token, courseId, variantId);
}

export async function promoteVariantAction(
  courseId: number,
  variantId: number,
): Promise<Schemas["VariantSummary"] | null> {
  const { token } = await requireProfessor();
  return promoteVariant(token, courseId, variantId);
}

export async function editVariantAction(
  courseId: number,
  variantId: number,
  edit: Schemas["VariantEdit"],
): Promise<Schemas["VariantSummary"] | null> {
  const { token } = await requireProfessor();
  return editVariant(token, courseId, variantId, edit);
}

export async function deleteVariantAction(
  courseId: number,
  variantId: number,
): Promise<boolean> {
  const { token } = await requireProfessor();
  return deleteVariant(token, courseId, variantId);
}
