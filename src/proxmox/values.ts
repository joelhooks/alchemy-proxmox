// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/values.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
export const num = (value: unknown, fallback: number) =>
  typeof value === "number" ? value : fallback;
export const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
export const bool = (value: unknown, fallback = false) =>
  value === undefined || value === null || value === ""
    ? fallback
    : value === 1 || value === true || value === "1";
export const flag = (value?: boolean) =>
  value === undefined ? undefined : value ? "1" : "0";
export const csv = (value: readonly string[] | string | undefined) =>
  (typeof value === "string" ? value.split(",") : (value ?? []))
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .sort()
    .join(",");
export const guestList = (value: unknown): string => {
  const parts =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value.map((entry: unknown) => String(entry))
        : [];
  return parts
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id))
    .sort((left, right) => left - right)
    .map((id) => String(id))
    .join(",");
};
export const canonicalToken = (raw: string) => {
  const lowered = raw.trim().toLowerCase();
  if (["1", "yes", "true", "on"].includes(lowered)) return "1";
  if (["0", "no", "false", "off"].includes(lowered)) return "0";
  return lowered;
};
export const propertyString = (value: unknown, defaultKey?: string): string => {
  const pairs: [string, string][] =
    typeof value === "string"
      ? value.split(",").map((part) => {
          const [key, ...rest] = part.split("=");
          return rest.length === 0 && defaultKey !== undefined
            ? [defaultKey, key ?? ""]
            : [key ?? "", rest.join("=")];
        })
      : typeof value === "object" && value !== null
        ? Object.entries(value).map(([key, entry]) => [key, String(entry)])
        : [];
  return pairs
    .map(([key, entry]) => [key.trim(), canonicalToken(entry)] as const)
    .filter(([key]) => key !== "")
    .map(([key, entry]) => `${key}=${entry}`)
    .sort()
    .join(",");
};
export const int = (value: unknown, fallback: number) => {
  if (typeof value === "number") return value;
  const parsed = Number.parseInt(text(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};
export const withClears = (
  fields: Record<string, string | undefined>,
  clear: readonly string[],
): Record<string, string> => {
  const cleared = new Set(clear);
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && !cleared.has(key)) kept[key] = value;
  }
  return cleared.size === 0
    ? kept
    : { ...kept, delete: [...cleared].join(",") };
};
