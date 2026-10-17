// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-judge.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { declaredKeys, declaredValue, indexedKey, wireValue } from "./qemu-props.ts";
import type { VmProps } from "./qemu-props.ts";
import { judgeDisk } from "./qemu-volume.ts";
import { netWrite, sameNet } from "./qemu-net.ts";
import { diskSizeDrift } from "./qemu-size.ts";
import { tagSet, sameMap } from "./lxc-wire.ts";
import { parseProperty, propertyFormat } from "./property-string.ts";

export interface VmChange {
  readonly put: Record<string, string>;
  readonly refuse: readonly string[];
  readonly drift: readonly string[];
}
const sameScalar = (key: string, want: string, have: string): boolean => {
  if (key === "tags") {
    return tagSet(want) === tagSet(have);
  }
  const format = propertyFormat("qemu", key);
  return format === undefined
    ? want === have
    : sameMap(parseProperty(want, format), parseProperty(have, format));
};
export const judge = (props: VmProps, config: Record<string, string>): VmChange => {
  const put: Record<string, string> = {};
  const refuse: string[] = [];
  const drift = new Set<string>(diskSizeDrift(props, config));
  for (const key of declaredKeys(props)) {
    const want = wireValue(declaredValue(props, key));
    const have = config[key];
    const family = indexedKey(key)?.[0];
    if (family === "scsi" || family === "ide") {
      if (have === undefined) {
        drift.add(key);
        put[key] = want;
      } else {
        const verdict = judgeDisk(key, want, have);
        if (verdict.refuse !== undefined) {
          drift.add(key);
          refuse.push(verdict.refuse);
        } else if (verdict.put !== undefined) {
          drift.add(key);
          put[key] = verdict.put;
        }
      }
      continue;
    }
    if (family === "net") {
      if (have === undefined) {
        drift.add(key);
        put[key] = want;
      } else if (!sameNet(want, have)) {
        drift.add(key);
        put[key] = netWrite(want, have);
      }
      continue;
    }
    const same = sameScalar(key, want, have ?? "");
    if (!same) {
      drift.add(key);
      put[key] = want;
    }
  }
  return { drift: [...drift].toSorted(), put, refuse };
};
export const identityRefusal = (vmid: number, was: number | undefined): string | undefined =>
  was === undefined || vmid === was
    ? undefined
    : `vmid: ${String(was)} -> ${String(vmid)} is a different VM. Declare it as a new resource; ` +
      "this one is retained when its declaration goes.";
