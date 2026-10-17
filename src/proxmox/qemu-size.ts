// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-size.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { type VmProps, declaredValue, indexedKey } from "./qemu-props.ts";
import { parseDisk } from "./qemu-volume.ts";
export class QemuDiskResizeRefused extends Data.TaggedError(
  "QemuDiskResizeRefused",
)<{
  readonly disk: string;
  readonly message: string;
}> {}
export const diskBytes = (config: string | undefined): number | undefined => {
  const size = config === undefined ? undefined : parseDisk(config).size;
  const match =
    size === undefined ? null : /^(\d+(?:\.\d+)?)([KMGT])?$/.exec(size);
  if (match === null) return undefined;
  const scale = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  const bytes = Number(match[1]) * (scale[match[2] as keyof typeof scale] ?? 1);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
};
export const validateDiskSizes = (props: VmProps, olds?: VmProps) =>
  Effect.gen(function* () {
    // Allocation sizes describe the create recipe, not a way to shrink an existing volume.
    for (const key of Object.keys(props)) {
      const family = indexedKey(key)?.[0];
      if (family !== "scsi" && family !== "ide") continue;
      const next = /^([^:]+):(\d+(?:\.\d+)?)$/.exec(
        String(declaredValue(props, key)),
      );
      const previous = /^([^:]+):(\d+(?:\.\d+)?)$/.exec(
        String(olds === undefined ? undefined : declaredValue(olds, key)),
      );
      if (
        next !== null &&
        previous !== null &&
        Number(next[2]) < Number(previous[2])
      ) {
        return yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk: key,
            message: `${key}: shrinking a declared disk allocation is not an in-place update.`,
          }),
        );
      }
    }
    const sizes = props.diskSizesGiB;
    if (sizes === undefined) return;
    if (sizes === null || typeof sizes !== "object" || Array.isArray(sizes)) {
      return yield* Effect.fail(
        new QemuDiskResizeRefused({
          disk: "diskSizesGiB",
          message: "diskSizesGiB must be a map of disk slots to GiB targets",
        }),
      );
    }
    for (const [disk, size] of Object.entries(sizes)) {
      if (size === undefined) continue;
      const family = indexedKey(disk)?.[0];
      const value = declaredValue(props, disk);
      const previous = olds?.diskSizesGiB?.[disk as keyof typeof sizes];
      let reason: string | undefined;
      if (
        (family !== "scsi" && family !== "ide") ||
        typeof value !== "string"
      ) {
        reason =
          "declare a supported scsi/ide disk slot before assigning a resize target";
      } else if (
        !Number.isSafeInteger(size) ||
        size <= 0 ||
        !Number.isSafeInteger(size * 1024 ** 3)
      ) {
        reason =
          "the target must be a positive, safely representable integer GiB size";
      } else if (
        value.split(",")[0]?.endsWith(":cloudinit") === true ||
        parseDisk(value).options.get("media") === "cdrom"
      ) {
        reason = "cloud-init and CD-ROM drives cannot be resized";
      } else if (previous !== undefined && size < previous) {
        reason = `refusing shrink from declared ${previous} GiB to ${size} GiB`;
      }
      if (reason !== undefined) {
        return yield* Effect.fail(
          new QemuDiskResizeRefused({ disk, message: `${disk}: ${reason}` }),
        );
      }
    }
  });
export const diskSizeDrift = (
  props: VmProps,
  config: Record<string, string>,
): string[] =>
  Object.entries(props.diskSizesGiB ?? {})
    .filter(
      ([disk, size]) =>
        size !== undefined && (diskBytes(config[disk]) ?? 0) < size * 1024 ** 3,
    )
    .map(([disk]) => `diskSizesGiB.${disk}`);
export const checkLiveDiskSizes = (
  props: VmProps,
  config: Record<string, string>,
  allowMissing = false,
) =>
  Effect.gen(function* () {
    for (const [disk, size] of Object.entries(props.diskSizesGiB ?? {})) {
      if (size === undefined) continue;
      if (allowMissing && config[disk] === undefined) continue;
      if (
        diskBytes(config[disk]) === undefined ||
        parseDisk(config[disk] ?? "").options.get("media") === "cdrom"
      ) {
        return yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk,
            message: `${disk}: the live disk has no readable positive size or is a CD-ROM`,
          }),
        );
      }
    }
  });
