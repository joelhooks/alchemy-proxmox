// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/values.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
export const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
export const bool = (value: unknown, fallback = false) =>
  value === undefined || value === null || value === ""
    ? fallback
    : value === 1 || value === true || value === "1";
export const canonicalToken = (raw: string) => {
  const lowered = raw.trim().toLowerCase();
  if (["1", "yes", "true", "on"].includes(lowered)) {
    return "1";
  }
  if (["0", "no", "false", "off"].includes(lowered)) {
    return "0";
  }
  return lowered;
};
const propertyPairs = (value: unknown, defaultKey?: string): [string, string][] => {
  if (typeof value === "string") {
    return value.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return rest.length === 0 && defaultKey !== undefined
        ? [defaultKey, key ?? ""]
        : [key ?? "", rest.join("=")];
    });
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).map(([key, entry]) => [key, String(entry)]);
  }
  return [];
};
export const propertyString = (value: unknown, defaultKey?: string): string =>
  propertyPairs(value, defaultKey)
    .map(([key, entry]) => [key.trim(), canonicalToken(entry)] as const)
    .filter(([key]) => key !== "")
    .map(([key, entry]) => `${key}=${entry}`)
    .toSorted()
    .join(",");
export const withClears = (
  fields: Record<string, string | undefined>,
  clear: readonly string[],
): Record<string, string> => {
  const cleared = new Set(clear);
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && !cleared.has(key)) {
      kept[key] = value;
    }
  }
  return cleared.size === 0 ? kept : { ...kept, delete: [...cleared].join(",") };
};
