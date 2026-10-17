// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-judge.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import {
  type LxcProps,
  declaredKeys,
  declaredValue,
  indexedKey,
  isManagedKey,
  wireValue,
} from "./lxc-props.ts";
import { isHostPath, judgeVolume, parseVolume } from "./lxc-volume.ts";
import {
  CLEARABLE,
  SCALAR_DEFAULTS,
  netMaps,
  netWrite,
  optionMap,
  pairs,
  sameMap,
  scalarForm,
  sortedForm,
} from "./lxc-wire.ts";
import { bool, canonicalToken } from "./values.ts";
export type LxcChange = {
  readonly put: Record<string, string>;
  readonly clear: readonly string[];
  readonly resize: readonly {
    readonly disk: string;
    readonly size: string;
  }[];
  readonly refuse: readonly string[];
  readonly drift: readonly string[];
};
const text = (value: unknown): string | undefined =>
  value === undefined || value === null ? undefined : wireValue(value);
export const rootOnly = (
  vmid: number,
  key: string,
  value: string,
  why: string,
): string =>
  `${key}: ${why} PVE lets only root@pam write it, and an API token is never root@pam. Run ` +
  `\`pct set ${String(vmid)} ${value === "" ? `--delete ${key}` : `--${key} '${value}'`}\` ` +
  "on the node, then plan again.";
const rawFeatures = (value: string) =>
  new Map(
    pairs(value).map(([key, entry]) => [
      key,
      key === "mount" ? entry : canonicalToken(entry),
    ]),
  );
export const featuresNeedRoot = (
  live: string,
  sent: string | undefined,
  unprivileged: boolean,
): boolean => {
  if (!unprivileged) return true;
  const have = rawFeatures(live);
  if (sent === undefined)
    return !(have.size === 0 || (have.size === 1 && have.has("nesting")));
  const want = rawFeatures(sent);
  const keys = new Set([...have.keys(), ...want.keys()]);
  return [...keys].some(
    (key) =>
      key !== "nesting" && (have.get(key) ?? "") !== (want.get(key) ?? ""),
  );
};
export const featureWhy = (unprivileged: boolean): string =>
  unprivileged
    ? "A feature other than nesting."
    : "Any feature on a privileged guest.";
export const judge = (
  props: LxcProps,
  live: Record<string, unknown>,
): LxcChange => {
  const put: Record<string, string> = {};
  const clear: string[] = [];
  const resize: {
    disk: string;
    size: string;
  }[] = [];
  const refuse: string[] = [];
  const drift = new Set<string>();
  const unprivileged = bool(live["unprivileged"], false);
  for (const key of declaredKeys(props)) {
    const want = wireValue(declaredValue(props, key));
    const have = text(live[key]);
    const indexed = indexedKey(key);
    if (key === "unprivileged") {
      if (canonicalToken(want) !== canonicalToken(have ?? "0")) {
        drift.add(key);
        refuse.push(
          `unprivileged: live ${have ?? "0"}, declared ${want}. PVE refuses to change it ("unable ` +
            'to modify read-only option"); only a backup and restore can, and that is a new guest.',
        );
      }
      continue;
    }
    if (key === "rootfs" || indexed?.[0] === "mp") {
      if (want === "") {
        if (have === undefined) continue;
        drift.add(key);
        refuse.push(
          `${key}: detaching a mount point moves its volume to unusedN -- do it by hand.`,
        );
      } else if (have === undefined) {
        drift.add(key);
        if (isHostPath(parseVolume(want))) {
          refuse.push(
            rootOnly(props.vmid, key, want, "A bind or device mount point."),
          );
        } else put[key] = want;
      } else {
        const verdict = judgeVolume(key, want, have);
        if (verdict.refuse !== undefined) refuse.push(verdict.refuse);
        if (verdict.rootOnly === true) {
          refuse.push(
            rootOnly(props.vmid, key, want, "A bind or device mount point."),
          );
        }
        if (verdict.put !== undefined) put[key] = verdict.put;
        if (verdict.resize !== undefined)
          resize.push({ disk: key, size: verdict.resize });
        if (Object.keys(verdict).length > 0) drift.add(key);
      }
      continue;
    }
    if (indexed?.[0] === "dev") {
      const same =
        want === ""
          ? have === undefined
          : have !== undefined && devSame(want, have);
      if (!same) {
        drift.add(key);
        refuse.push(rootOnly(props.vmid, key, want, "Device passthrough."));
      }
      continue;
    }
    if (indexed?.[0] === "net") {
      if (want === "") {
        if (have !== undefined) {
          drift.add(key);
          clear.push(key);
        }
      } else if (have === undefined) {
        drift.add(key);
        put[key] = want;
      } else {
        const maps = netMaps(want, have);
        if (!sameMap(maps.want, maps.have)) {
          drift.add(key);
          put[key] = netWrite(want, have);
        }
      }
      continue;
    }
    if (!isManagedKey(key)) {
      drift.add(key);
      refuse.push(`${key}: not a config key this resource manages.`);
      continue;
    }
    const wanted = want === "" ? "" : scalarForm(key, want);
    const current = have ?? SCALAR_DEFAULTS[key];
    const had = current === undefined ? "" : scalarForm(key, current);
    if (wanted === had) continue;
    drift.add(key);
    const next = key === "features" ? wanted : want;
    if (
      key === "features" &&
      featuresNeedRoot(have ?? "", next || undefined, unprivileged)
    ) {
      refuse.push(rootOnly(props.vmid, key, want, featureWhy(unprivileged)));
    } else if (next === "" && CLEARABLE.has(key)) {
      clear.push(key);
    } else if (next === "") {
      refuse.push(
        `${key}: cannot be removed; declare the value it should have.`,
      );
    } else put[key] = next;
  }
  return { clear, drift: [...drift].sort(), put, refuse, resize };
};
const devSame = (want: string, have: string) =>
  sortedForm(optionMap(want, "dev", "path")) ===
  sortedForm(optionMap(have, "dev", "path"));
