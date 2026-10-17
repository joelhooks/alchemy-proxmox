// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-volume.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { optionMap, pairs, sameMap } from "./lxc-wire.ts";

const NEW_DISK = /^(?<source>[^:\s]+):(?<gib>\d+(?:\.\d+)?)$/u;
const UNITS: Readonly<Record<string, number>> = {
  G: 1024 ** 3,
  K: 1024,
  M: 1024 ** 2,
  T: 1024 ** 4,
};
export const sizeBytes = (text: string): number | undefined => {
  const match = /^(?<amount>\d+(?:\.\d+)?)(?<unit>[KMGT])?$/u.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  return Math.trunc(Number(match[1]) * (match[2] === undefined ? 1 : (UNITS[match[2]] ?? 1)));
};
export interface Volume {
  readonly kind: "new" | "volume" | "bind" | "device";
  readonly source: string;
  readonly volname: string;
  readonly size: number | undefined;
  readonly sizeText: string | undefined;
  readonly options: Map<string, string>;
}
export const parseVolume = (text: string): Volume => {
  const [first] = pairs(text, "volume");
  const spec = first?.[0] === "volume" ? first[1] : "";
  const options = optionMap(text, "volume", "volume");
  options.delete("volume");
  const sizeText = options.get("size");
  options.delete("size");
  const fresh = NEW_DISK.exec(spec);
  if (fresh !== null) {
    const gib = `${fresh[2] ?? "0"}G`;
    return {
      kind: "new",
      options,
      size: sizeBytes(gib),
      sizeText: gib,
      source: fresh[1] ?? "",
      volname: "",
    };
  }
  const size = sizeText === undefined ? undefined : sizeBytes(sizeText);
  if (spec.startsWith("/")) {
    const kind = spec.startsWith("/dev/") ? "device" : "bind";
    return { kind, options, size, sizeText, source: spec, volname: "" };
  }
  const at = spec.indexOf(":");
  return {
    kind: "volume",
    options,
    size,
    sizeText,
    source: at === -1 ? spec : spec.slice(0, at),
    volname: at === -1 ? "" : spec.slice(at + 1),
  };
};
export interface VolumeVerdict {
  readonly refuse?: string;
  readonly rootOnly?: boolean;
  readonly put?: string;
  readonly resize?: string;
}
export const isHostPath = (volume: Volume) => volume.kind === "bind" || volume.kind === "device";
const rewrite = (live: Volume, declared: Volume) => {
  const parts = [`${live.source}:${live.volname}`];
  for (const [key, value] of declared.options) {
    parts.push(`${key}=${value}`);
  }
  if (live.sizeText !== undefined) {
    parts.push(`size=${live.sizeText}`);
  }
  return parts.join(",");
};
export const judgeVolume = (key: string, declared: string, live: string): VolumeVerdict => {
  const want = parseVolume(declared);
  const have = parseVolume(live);
  if (isHostPath(want) || isHostPath(have)) {
    const same =
      want.kind === have.kind && want.source === have.source && sameMap(want.options, have.options);
    return same ? {} : { rootOnly: true };
  }
  if (want.source !== have.source) {
    return {
      refuse:
        `${key}: the volume is on ${have.source}, declared on ${want.source}. Moving it is ` +
        "`pct move-volume` (a copy), not a config update -- move it by hand, then declare it.",
    };
  }
  if (want.kind === "volume" && want.volname !== have.volname) {
    return {
      refuse:
        `${key}: declared volume ${want.volname} is not the live ${have.volname}. Writing it would ` +
        "detach the live volume to unusedN; attach or swap volumes by hand.",
    };
  }
  let resize: string | undefined;
  if (want.size !== undefined && have.size !== undefined && want.size !== have.size) {
    if (want.size < have.size) {
      return {
        refuse:
          `${key}: declared ${want.sizeText ?? "?"} is smaller than the live ` +
          `${have.sizeText ?? "?"}. PVE cannot shrink a container volume ("unable to shrink disk ` +
          'size"), and replacing the guest to get there is not an update this resource makes.',
      };
    }
    resize = want.sizeText;
  }
  const put = sameMap(want.options, have.options) ? undefined : rewrite(have, want);
  return {
    ...(put === undefined ? {} : { put }),
    ...(resize === undefined ? {} : { resize }),
  };
};
