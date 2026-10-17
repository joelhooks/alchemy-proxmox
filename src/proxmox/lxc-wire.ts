// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-wire.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { canonicalToken, propertyString } from "./values.ts";

export const pairs = (value: string, defaultKey?: string): [string, string][] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part): [string, string] => {
      const at = part.indexOf("=");
      if (at === -1) {
        return [defaultKey ?? part, defaultKey === undefined ? "" : part];
      }
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
    });
const DEFAULTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  dev: { "deny-write": "0" },
  features: {
    force_rw_sys: "0",
    fuse: "0",
    keyctl: "0",
    mknod: "0",
    nesting: "0",
  },
  net: { firewall: "0", "host-managed": "0", link_down: "0", type: "veth" },
  volume: {
    backup: "0",
    keepattrs: "0",
    quota: "0",
    replicate: "1",
    ro: "0",
    shared: "0",
  },
};
const FLAGS = new Set([
  "acl",
  "backup",
  "deny-write",
  "firewall",
  "force_rw_sys",
  "fuse",
  "host-managed",
  "keepattrs",
  "keyctl",
  "link_down",
  "mknod",
  "nesting",
  "quota",
  "replicate",
  "ro",
  "shared",
]);
const SETS = new Set(["mount", "mountoptions"]);
const canonicalValue = (key: string, value: string) => {
  if (FLAGS.has(key)) {
    return canonicalToken(value);
  }
  if (SETS.has(key)) {
    return [...new Set(value.split(";").map((part) => part.trim()))].toSorted().join(";");
  }
  if (key === "hwaddr") {
    return value.toUpperCase();
  }
  return value;
};
export const optionMap = (
  value: string,
  family: keyof typeof DEFAULTS,
  defaultKey?: string,
): Map<string, string> => {
  const defaults = DEFAULTS[family] ?? {};
  const out = new Map<string, string>();
  for (const [key, raw] of pairs(value, defaultKey)) {
    const canonical = canonicalValue(key, raw);
    if (defaults[key] !== canonical) {
      out.set(key, canonical);
    }
  }
  return out;
};
export const sameMap = (left: Map<string, string>, right: Map<string, string>) =>
  left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
export const sortedForm = (map: Map<string, string>) =>
  [...map]
    .map(([key, value]) => `${key}=${value}`)
    .toSorted()
    .join(",");
export const printMap = (map: Map<string, string>, lead: readonly string[] = []) =>
  [...lead.filter((key) => map.has(key)), ...[...map.keys()].filter((k) => !lead.includes(k))]
    .map((key) => `${key}=${map.get(key) ?? ""}`)
    .join(",");
export const netMaps = (declared: string, live: string) => {
  const want = optionMap(declared, "net");
  const have = optionMap(live, "net");
  if (!want.has("hwaddr")) {
    have.delete("hwaddr");
  }
  return { have, want };
};
export const netWrite = (declared: string, live: string | undefined) => {
  const want = new Map(pairs(declared));
  const mac = live === undefined ? undefined : new Map(pairs(live)).get("hwaddr");
  if (!want.has("hwaddr") && mac !== undefined) {
    want.set("hwaddr", mac);
  }
  return printMap(want, ["name"]);
};
export const tagSet = (value: string) =>
  [
    ...new Set(
      value
        .split(/[;,\s]+/u)
        .filter((tag) => tag !== "")
        .map((tag) => tag.toLowerCase()),
    ),
  ]
    .toSorted()
    .join(";");
export const orderedList = (value: string) =>
  value
    .split(/[;,\s]+/u)
    .filter((part) => part !== "")
    .join(" ");
export const descriptionText = (value: string) => value.replace(/\s+$/u, "");
export const SCALAR_KINDS: Readonly<Record<string, "text" | "number" | "flag" | "form">> = {
  arch: "text",
  cmode: "text",
  console: "flag",
  cores: "number",
  cpulimit: "number",
  cpuunits: "number",
  description: "form",
  features: "form",
  hostname: "text",
  memory: "number",
  nameserver: "form",
  onboot: "flag",
  ostype: "text",
  protection: "flag",
  searchdomain: "form",
  startup: "form",
  swap: "number",
  tags: "form",
  timezone: "text",
  tty: "number",
};
export const CLEARABLE: ReadonlySet<string> = new Set([
  "description",
  "features",
  "nameserver",
  "searchdomain",
  "startup",
  "tags",
  "timezone",
]);
export const SCALAR_DEFAULTS: Readonly<Record<string, string>> = {
  arch: "amd64",
  cmode: "tty",
  console: "1",
  cpulimit: "0",
  memory: "512",
  onboot: "0",
  protection: "0",
  swap: "512",
  tty: "2",
};
export const scalarForm = (key: string, value: string): string => {
  const kind = SCALAR_KINDS[key];
  if (kind === "number") {
    return String(Number(value));
  }
  if (kind === "flag") {
    return canonicalToken(value);
  }
  if (key === "description") {
    return descriptionText(value);
  }
  if (key === "features") {
    return sortedForm(optionMap(value, "features"));
  }
  if (key === "nameserver" || key === "searchdomain") {
    return orderedList(value);
  }
  if (key === "startup") {
    return propertyString(value, "order");
  }
  if (key === "tags") {
    return tagSet(value);
  }
  return value;
};
