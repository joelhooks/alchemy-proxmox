// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-props.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
export type PveFlag = boolean | 0 | 1;
export interface VmProps {
  node: string;
  vmid: number;
  pool?: string;
  /** Start only after create; power state is not managed. */
  start?: PveFlag;
  name?: string;
  memory?: number;
  cores?: number;
  sockets?: number;
  cpu?: string;
  onboot?: PveFlag;
  agent?: PveFlag;
  boot?: string;
  scsihw?: string;
  nameserver?: string;
  searchdomain?: string;
  diskSizesGiB?: Partial<Record<`scsi${number}` | `ide${number}`, number>>;
  [scsi: `scsi${number}`]: string | undefined;
  [nic: `net${number}`]: string | undefined;
  [cloudinit: `ide${number}`]: string | undefined;
  [ipconfig: `ipconfig${number}`]: string | undefined;
  [serial: `serial${number}`]: string | undefined;
  cipassword?: never;
  machine?: never;
}
export interface VmAttributes {
  digest: string;
  node: string;
  vmid: number;
  config: Record<string, string>;
}
const NOT_CONFIG: ReadonlySet<string> = new Set([
  "node",
  "vmid",
  "pool",
  "start",
  "diskSizesGiB",
]);
export const INDEXED = {
  ide: 4,
  ipconfig: 32,
  net: 32,
  scsi: 31,
  serial: 4,
} as const;
export type IndexedFamily = keyof typeof INDEXED;
export const indexedKey = (
  key: string,
): readonly [IndexedFamily, number] | undefined => {
  const match = /^(ide|ipconfig|net|scsi|serial)(0|[1-9]\d*)$/.exec(key);
  if (match === null) return undefined;
  const family = match[1] as IndexedFamily;
  const index = Number(match[2]);
  return index < INDEXED[family] ? [family, index] : undefined;
};
const SCALAR_KEYS: ReadonlySet<string> = new Set([
  "agent",
  "boot",
  "cores",
  "cpu",
  "memory",
  "name",
  "nameserver",
  "onboot",
  "scsihw",
  "searchdomain",
  "sockets",
]);
export const isManagedKey = (key: string): boolean =>
  SCALAR_KEYS.has(key) || indexedKey(key) !== undefined;
export const declaredValue = (props: VmProps, key: string): unknown =>
  (props as unknown as Record<string, unknown>)[key];
export const declaredKeys = (props: VmProps): string[] =>
  Object.keys(props)
    .filter(
      (key) => !NOT_CONFIG.has(key) && declaredValue(props, key) !== undefined,
    )
    .sort();
export const wireValue = (value: unknown): string =>
  value === true ? "1" : value === false ? "0" : String(value);
export const storedConfig = (
  live: Record<string, unknown>,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(live)) {
    if (!isManagedKey(key)) continue;
    if (value === null || value === undefined || typeof value === "object")
      continue;
    out[key] = wireValue(value);
  }
  return out;
};
