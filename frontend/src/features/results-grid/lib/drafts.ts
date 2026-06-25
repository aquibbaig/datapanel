import type { CellDraft } from "../types";

export function toDraft(value: unknown): CellDraft {
  if (value === null || value === undefined) {
    return { value: "", isNull: true };
  }
  return {
    value: typeof value === "object" ? JSON.stringify(value) : String(value),
    isNull: false,
  };
}

export function sameDraft(left: CellDraft, right: CellDraft) {
  if (isNullDraft(left) && isNullDraft(right)) return true;
  return left.isNull === right.isNull && left.value === right.value;
}

export function isNullDraft(draft: CellDraft) {
  return draft.isNull || draft.typedNull === true;
}

export function isTypedNull(value: string) {
  return value.trim().toUpperCase() === "NULL";
}

export function draftValue(draft: CellDraft) {
  return isNullDraft(draft) ? null : draft.value;
}
