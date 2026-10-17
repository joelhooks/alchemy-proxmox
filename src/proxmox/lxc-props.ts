// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-props.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { SCALAR_KINDS } from "./lxc-wire.ts";

export type PveFlag = boolean | 0 | 1;
export interface LxcProps {
  recreateIfMissing?: boolean;
  node: string;
  vmid: number;
  pool?: string;
  ostemplate?: string;
  start?: PveFlag;
  unprivileged?: PveFlag;
  hostname?: string;
  arch?: string;
  ostype?: string;
  cores?: number;
  cpulimit?: number;
  cpuunits?: number;
  memory?: number;
  swap?: number;
  rootfs?: string;
  features?: string;
  onboot?: PveFlag;
  startup?: string;
  protection?: PveFlag;
  description?: string;
  tags?: string;
  nameserver?: string;
  searchdomain?: string;
  timezone?: string;
  console?: PveFlag;
  tty?: number;
  cmode?: string;
  [mount: `mp${number}`]: string | undefined;
  [nic: `net${number}`]: string | undefined;
  [device: `dev${number}`]: string | undefined;
  password?: never;
  "ssh-public-keys"?: never;
  env?: never;
}
export interface LxcAttributes {
  node: string;
  vmid: number;
  config: Record<string, string>;
  rawKeys: string[];
}
export const UNSTORED: ReadonlySet<string> = new Set([
  "description",
  "digest",
  "env",
  "lock",
  "lxc",
  "pending",
]);
export const INDEXED = {
  dev: 256,
  mp: 256,
  net: 32,
} as const;
export type IndexedFamily = keyof typeof INDEXED;
export const indexedKey = (key: string): readonly [IndexedFamily, number] | undefined => {
  const match = /^(?<family>mp|net|dev)(?<index>0|[1-9]\d*)$/u.exec(key);
  if (match === null) {
    return undefined;
  }
  const family = match.groups?.family;
  if (family !== "mp" && family !== "net" && family !== "dev") {
    return undefined;
  }
  const index = Number(match[2]);
  return index < INDEXED[family] ? [family, index] : undefined;
};
export const NOT_CONFIG: ReadonlySet<string> = new Set([
  "node",
  "ostemplate",
  "recreateIfMissing",
  "pool",
  "start",
  "vmid",
]);
export const declaredValue = (props: LxcProps, key: string): unknown => {
  const fields: Record<string, unknown> = { ...props };
  return fields[key];
};
export const declaredKeys = (props: LxcProps): string[] =>
  Object.keys(props)
    .filter((key) => !NOT_CONFIG.has(key) && declaredValue(props, key) !== undefined)
    .toSorted();
export const wireValue = (value: unknown): string => {
  if (value === true) {
    return "1";
  }
  if (value === false) {
    return "0";
  }
  return String(value);
};
export const isManagedKey = (key: string): boolean =>
  SCALAR_KINDS[key] !== undefined ||
  key === "unprivileged" ||
  key === "rootfs" ||
  indexedKey(key) !== undefined;
export const storedConfig = (live: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(live)) {
    if (!isManagedKey(key) || UNSTORED.has(key)) {
      continue;
    }
    if (value === null || value === undefined || typeof value === "object") {
      continue;
    }
    out[key] = wireValue(value);
  }
  return out;
};
export const rawKeysOf = (live: Record<string, unknown>): string[] => {
  const raw = live.lxc;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((pair: unknown) => (Array.isArray(pair) ? String(pair[0]) : ""))
    .filter((key) => key !== "");
};
