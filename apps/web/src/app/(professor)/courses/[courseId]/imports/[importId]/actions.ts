"use server";

// The authed calls for the import confirmation surface (milestone 4.4), run
// server-side so the professor JWT never reaches client JavaScript (decision
// 0012). The client surface calls these for the read (on refetch after a verb),
// the item verbs, and the figure verbs. Figure crops happen server-side from the
// lossless source; the client only ever sends a normalised bbox.
import type { Schemas } from "@/lib/api/client";
import {
  addFigureFromBox,
  confirmItem,
  discardItem,
  getImportItems,
  mergeItems,
  removeFigure,
  setFigureRole,
} from "@/lib/api/imports";
import { requireProfessor } from "@/lib/professor-session";

export async function getImportItemsAction(
  courseId: number,
  importId: number,
): Promise<Schemas["ImportItemsOut"] | null> {
  const { token } = await requireProfessor();
  return getImportItems(token, courseId, importId);
}

export async function confirmItemAction(
  courseId: number,
  itemId: number,
  body: Schemas["ConfirmIn"],
): Promise<Schemas["ConfirmedOut"] | null> {
  const { token } = await requireProfessor();
  return confirmItem(token, courseId, itemId, body);
}

export async function discardItemAction(
  courseId: number,
  itemId: number,
): Promise<boolean> {
  const { token } = await requireProfessor();
  return discardItem(token, courseId, itemId);
}

export async function mergeItemsAction(
  courseId: number,
  survivorId: number,
  sourceItemId: number,
): Promise<Schemas["MergedOut"] | null> {
  const { token } = await requireProfessor();
  return mergeItems(token, courseId, survivorId, sourceItemId);
}

export async function addFigureFromBoxAction(
  courseId: number,
  itemId: number,
  body: Schemas["AddBoxIn"],
): Promise<Schemas["FigureCreatedOut"] | null> {
  const { token } = await requireProfessor();
  return addFigureFromBox(token, courseId, itemId, body);
}

export async function setFigureRoleAction(
  courseId: number,
  itemId: number,
  figureId: number,
  role: "essential" | "decorative",
): Promise<boolean> {
  const { token } = await requireProfessor();
  return setFigureRole(token, courseId, itemId, figureId, role);
}

export async function removeFigureAction(
  courseId: number,
  itemId: number,
  figureId: number,
): Promise<boolean> {
  const { token } = await requireProfessor();
  return removeFigure(token, courseId, itemId, figureId);
}
