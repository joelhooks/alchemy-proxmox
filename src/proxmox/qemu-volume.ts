// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-volume.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { sameMap } from "./lxc-wire.ts";
import { parseProperty, propertyFormat } from "./property-string.ts";

const NEW_DISK = /^(?<source>[^:\s]+):(?<gib>\d+(?:\.\d+)?)$/u;
const NEW_CLOUDINIT = /^(?<source>[^:\s]+):cloudinit$/u;
export interface Disk {
  readonly kind: "fresh" | "volume";
  readonly source: string;
  readonly volname: string;
  readonly size: string | undefined;
  readonly options: Map<string, string>;
}
export const diskFile = (text: string, key = "scsi0") =>
  parseProperty(text, propertyFormat("qemu", key)).get("file") ?? "";
export const parseDisk = (text: string, key = "scsi0"): Disk => {
  const options = parseProperty(text, propertyFormat("qemu", key));
  const file = options.get("file") ?? "";
  options.delete("file");
  const size = options.get("size");
  options.delete("size");
  const bare = NEW_DISK.exec(file) ?? NEW_CLOUDINIT.exec(file);
  if (bare !== null) {
    if (file.endsWith(":0") && options.has("import-from")) {
      options.delete("import-from");
    }
    return {
      kind: "fresh",
      options,
      size: undefined,
      source: bare[1] ?? "",
      volname: "",
    };
  }
  const at = file.indexOf(":");
  const source = at === -1 ? file : file.slice(0, at);
  const volname = at === -1 ? "" : file.slice(at + 1);
  return { kind: "volume", options, size, source, volname };
};
export interface DiskVerdict {
  readonly refuse?: string;
  readonly put?: string;
}
const printOptions = (
  source: string,
  volname: string,
  options: Map<string, string>,
  size: string | undefined,
) =>
  [
    `${source}:${volname}`,
    ...[...options].map(([k, v]) => `${k}=${v}`),
    ...(size === undefined ? [] : [`size=${size}`]),
  ].join(",");
export const judgeDisk = (key: string, declared: string, live: string): DiskVerdict => {
  const want = parseDisk(declared, key);
  const have = parseDisk(live, key);
  if (want.source !== have.source) {
    return {
      refuse:
        `${key}: the volume is on ${have.source}, declared on ${want.source}. Moving a disk ` +
        "between storages is not an update this resource makes -- move it by hand, then declare it.",
    };
  }
  if (want.kind === "fresh") {
    if (want.options.size === 0) {
      return {};
    }
    if ([...want.options].every(([k, v]) => have.options.get(k) === v)) {
      return {};
    }
    return {
      put: printOptions(have.source, have.volname, want.options, have.size),
    };
  }
  if (want.volname !== have.volname) {
    return {
      refuse:
        `${key}: declared volume ${want.volname} is not the live ${have.volname}. Writing it ` +
        "would detach the live volume to unusedN; attach or swap volumes by hand.",
    };
  }
  if (want.size !== undefined && have.size !== undefined && want.size !== have.size) {
    return {
      refuse:
        `${key}: declared size ${want.size} differs from the live ${have.size}. This resource does ` +
        "not resize a disk through config -- omit size= and declare a diskSizesGiB target instead.",
    };
  }
  if (sameMap(want.options, have.options)) {
    return {};
  }
  return {
    put: printOptions(have.source, have.volname, want.options, have.size),
  };
};
