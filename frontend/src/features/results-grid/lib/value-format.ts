export function formatCell(value: unknown) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function formatCellDisplay(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return { kind: "null" as const, text: "NULL" };
  }
  if (typeof value === "boolean") {
    return { kind: "boolean" as const, text: value ? "true" : "false" };
  }
  if (typeof value === "number") {
    return { kind: "number" as const, text: String(value) };
  }
  if (typeof value === "object") {
    return { kind: "json" as const, text: JSON.stringify(value) };
  }
  const text = String(value);
  if (looksLikeJSON(text)) {
    return { kind: "json" as const, text };
  }
  return { kind: "text" as const, text };
}

export function isInspectableValue(value: unknown) {
  if (value && typeof value === "object") return true;
  const text = formatCell(value);
  return text.length > 80 || looksLikeJSON(text) || text.includes("\n");
}

export function formatInspectableValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "NULL";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const text = String(value);
  if (looksLikeJSON(text)) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

export function looksLikeJSON(value: string) {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}
