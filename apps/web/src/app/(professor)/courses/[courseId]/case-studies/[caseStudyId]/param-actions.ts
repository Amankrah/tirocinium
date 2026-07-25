"use server";

// The authed calls for the parameterization panel (Phase 5.5), run server-side
// so the professor JWT never reaches client JavaScript (decision 0012).
import type { Schemas } from "@/lib/api/client";
import {
  autoParameterize,
  deleteParamSpec,
  getParamSpec,
  saveParamSpec,
  type SaveSpecResult,
} from "@/lib/api/params";
import { requireProfessor } from "@/lib/professor-session";

export async function getParamSpecAction(
  courseId: number,
  caseStudyId: number,
): Promise<Schemas["ParamSpec"] | null> {
  const { token } = await requireProfessor();
  return getParamSpec(token, courseId, caseStudyId);
}

export async function saveParamSpecAction(
  courseId: number,
  caseStudyId: number,
  spec: Schemas["ParamSpec"],
): Promise<SaveSpecResult> {
  const { token } = await requireProfessor();
  return saveParamSpec(token, courseId, caseStudyId, spec);
}

export async function deleteParamSpecAction(
  courseId: number,
  caseStudyId: number,
): Promise<boolean> {
  const { token } = await requireProfessor();
  return deleteParamSpec(token, courseId, caseStudyId);
}

export async function autoParameterizeAction(
  courseId: number,
  caseStudyId: number,
  idempotencyKey: string,
): Promise<Schemas["ProposalOut"] | null> {
  const { token } = await requireProfessor();
  return autoParameterize(token, courseId, caseStudyId, idempotencyKey);
}
