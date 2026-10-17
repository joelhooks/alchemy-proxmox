// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-resize.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import { storedConfig } from "./qemu-props.ts";
import type { VmProps } from "./qemu-props.ts";
import { readVm } from "./qemu-read.ts";
import { QemuDiskResizeRefused, checkLiveDiskSizes, diskBytes } from "./qemu-size.ts";
import { qemuTask } from "./qemu-task.ts";
import { formViolations } from "./constraint-guard.ts";

const RESIZE_POLLS = 60;
const unlockedConfig = (props: VmProps, disk: string) =>
  Effect.gen(function* unlockedConfigEffect() {
    for (let attempt = 0; ; attempt += 1) {
      const live = yield* readVm(props);
      if (live === undefined) {
        return yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk,
            message: "VM disappeared before resize",
            node: props.node,
            vmid: props.vmid,
          }),
        );
      }
      if (live.lock === undefined) {
        return {
          config: storedConfig(Object.fromEntries(Object.entries(live))),
          polls: RESIZE_POLLS - attempt,
        };
      }
      if (attempt === RESIZE_POLLS - 1) {
        yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk,
            message: `${disk}: VM ${props.vmid} remains locked (${live.lock}) after ${RESIZE_POLLS} observations; refusing resize`,
            node: props.node,
            vmid: props.vmid,
          }),
        );
      }
      yield* Effect.sleep("1 second");
    }
  });
export const resizeDisks = (props: VmProps) =>
  Effect.gen(function* resizeDisksEffect() {
    const targets = Object.entries(props.diskSizesGiB ?? {}).filter(
      (entry): entry is [string, number] => entry[1] !== undefined,
    );
    const [first] = targets;
    if (first === undefined) {
      return;
    }
    const live = yield* readVm(props);
    if (live === undefined) {
      yield* Effect.fail(
        new QemuDiskResizeRefused({
          disk: first[0],
          message: "VM disappeared before resize",
          node: props.node,
          vmid: props.vmid,
        }),
      );
      return;
    }
    const observed = storedConfig(Object.fromEntries(Object.entries(live)));
    yield* checkLiveDiskSizes(props, observed);
    for (const [disk, size] of targets) {
      if ((diskBytes(observed[disk]) ?? 0) >= size * 1024 ** 3) {
        continue;
      }
      const { config, polls } = yield* unlockedConfig(props, disk);
      yield* checkLiveDiskSizes(props, config);
      if ((diskBytes(config[disk]) ?? 0) >= size * 1024 ** 3) {
        continue;
      }
      const form = { disk, size: `${size}G` };
      const refused = formViolations("pve:PUT /nodes/{node}/qemu/{vmid}/resize", form, true);
      if (refused.length > 0) {
        yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk,
            message: refused.join("\n"),
            node: props.node,
            vmid: props.vmid,
          }),
        );
      }
      yield* qemuTask(
        props,
        nodes.putNodeQemuResize({
          node: props.node,
          vmid: String(props.vmid),
          ...form,
        }),
        `resize VM ${props.vmid} ${disk} to ${size} GiB`,
        polls,
      );
    }
  });
