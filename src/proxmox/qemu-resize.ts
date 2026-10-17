// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-resize.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import { type VmProps, storedConfig } from "./qemu-props.ts";
import { readVm } from "./qemu-read.ts";
import {
  QemuDiskResizeRefused,
  checkLiveDiskSizes,
  diskBytes,
} from "./qemu-size.ts";
import { qemuTask } from "./qemu-task.ts";
import { formViolations } from "./constraint-guard.ts";
const RESIZE_POLLS = 60;
const unlockedConfig = (props: VmProps, disk: string) =>
  Effect.gen(function* () {
    for (let attempt = 0; ; attempt++) {
      const live = yield* readVm(props);
      if (live === undefined)
        return yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk,
            message: "VM disappeared before resize",
          }),
        );
      if (live.lock === undefined)
        return {
          config: storedConfig(live as unknown as Record<string, unknown>),
          polls: RESIZE_POLLS - attempt,
        };
      if (attempt === RESIZE_POLLS - 1)
        return yield* Effect.fail(
          new QemuDiskResizeRefused({
            disk,
            message: `${disk}: VM ${props.vmid} remains locked (${live.lock}) after ${RESIZE_POLLS} observations; refusing resize`,
          }),
        );
      yield* Effect.sleep("1 second");
    }
  });
export const resizeDisks = (props: VmProps) =>
  Effect.gen(function* () {
    const targets = Object.entries(props.diskSizesGiB ?? {}).filter(
      (entry): entry is [string, number] => entry[1] !== undefined,
    );
    const first = targets[0];
    if (first === undefined) return;
    const live = yield* readVm(props);
    if (live === undefined)
      return yield* Effect.fail(
        new QemuDiskResizeRefused({
          disk: first[0],
          message: "VM disappeared before resize",
        }),
      );
    const observed = storedConfig(live as unknown as Record<string, unknown>);
    yield* checkLiveDiskSizes(props, observed);
    for (const [disk, size] of targets) {
      if ((diskBytes(observed[disk]) ?? 0) >= size * 1024 ** 3) continue;
      const { config, polls } = yield* unlockedConfig(props, disk);
      yield* checkLiveDiskSizes(props, config);
      if ((diskBytes(config[disk]) ?? 0) >= size * 1024 ** 3) continue;
      const form = { disk, size: `${size}G` };
      const refused = formViolations(
        "pve:PUT /nodes/{node}/qemu/{vmid}/resize",
        form,
        true,
      );
      if (refused.length > 0) {
        return yield* Effect.fail(
          new QemuDiskResizeRefused({ disk, message: refused.join("\n") }),
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
