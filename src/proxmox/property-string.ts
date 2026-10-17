// Splitting adapted from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-wire.ts and values.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { PROPERTY_FORMATS } from "./property-formats.ts";
import type { FieldKind, PropertyFormat } from "./property-formats.ts";
import { canonicalToken } from "./values.ts";

export const propertyFormat = (guest: "qemu" | "lxc", key: string): PropertyFormat | undefined => {
  const formats = PROPERTY_FORMATS[guest];
  const family = key.replace(/\d+$/u, "[n]");
  if (Object.hasOwn(formats, key)) {
    return formats[key];
  }
  return Object.hasOwn(formats, family) ? formats[family] : undefined;
};
const canonicalValue = (value: string, kind: FieldKind | undefined): string => {
  if (kind === "boolean") {
    return canonicalToken(value);
  }
  if (kind === "mac") {
    return value.toUpperCase();
  }
  if (kind === "integer" && /^[+-]?\d+$/u.test(value)) {
    return BigInt(value).toString();
  }
  if (
    kind === "number" &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value) &&
    Number.isFinite(Number(value))
  ) {
    return String(Number(value));
  }
  return value;
};

const setUnique = (out: Map<string, string>, key: string, value: string): void => {
  if (out.has(key)) {
    throw new Error(`Duplicate property subkey: ${key}`);
  }
  out.set(key, value);
};

/** Parse API property strings, retaining unknown fields and rejecting duplicate subkeys. */
export const parseProperty = (
  value: string | boolean | number | null | undefined,
  format: PropertyFormat | undefined,
): Map<string, string> => {
  const out = new Map<string, string>();
  const parts = (value === undefined || value === null ? "" : String(value))
    .split(",")
    .filter((part) => part.trim() !== "");
  for (const part of parts) {
    const at = part.indexOf("=");
    let key: string;
    let raw: string;
    if (at === -1) {
      key = format?.defaultKey ?? part;
      raw = format?.defaultKey === undefined ? "" : part;
    } else {
      key = part.slice(0, at).trim();
      raw = part.slice(at + 1);
    }
    const alias =
      format !== undefined && Object.hasOwn(format.aliases, key) ? format.aliases[key] : undefined;
    if (alias?.keyAlias !== undefined) {
      setUnique(out, alias.keyAlias, key);
    }
    const target = alias?.target ?? key;
    const kind =
      format !== undefined && Object.hasOwn(format.fields, target)
        ? format.fields[target]
        : undefined;
    setUnique(out, target, canonicalValue(raw, kind));
  }
  return out;
};
