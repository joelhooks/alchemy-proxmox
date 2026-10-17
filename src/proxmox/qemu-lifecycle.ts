// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-lifecycle.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import { formRefusals } from "./qemu-form.ts";
import { QemuRefusedError } from "./qemu-errors.ts";
import { identityRefusal, judge } from "./qemu-judge.ts";
import type { VmAttributes, VmProps } from "./qemu-props.ts";
import { readVm } from "./qemu-read.ts";
import { qemuTask } from "./qemu-task.ts";
import { attributesOf, guardUpdate } from "./qemu-spec.ts";
import { validateDiskSizes } from "./qemu-size.ts";
import { validatePropertyStrings } from "./property-validation.ts";

export const refuseVm = (
  props: VmProps,
  reasons: readonly string[],
  keys: readonly string[] = [],
) => Effect.fail(new QemuRefusedError({ keys, node: props.node, reasons, vmid: props.vmid }));
export const readQemu = (props: VmProps) =>
  readVm(props).pipe(
    Effect.map((live) =>
      live === undefined
        ? undefined
        : attributesOf(Object.fromEntries(Object.entries(live)), props),
    ),
  );
export const validateVm = Effect.fn(function* validateVmEffect(
  news: VmProps,
  olds?: VmProps,
  output?: VmAttributes,
) {
  const identity = identityRefusal(news.vmid, output?.vmid ?? olds?.vmid);
  if (identity !== undefined) {
    yield* refuseVm(news, [identity], ["vmid"]);
  }
  const node = output?.node ?? olds?.node;
  if (node !== undefined && news.node !== node) {
    yield* refuseVm(
      news,
      ["This resource never migrates a VM. Move it by hand and import it as a new resource."],
      ["node"],
    );
  }
  if (olds !== undefined && news.pool !== olds.pool) {
    yield* refuseVm(news, ["Moving a guest between pools is an operator action."], ["pool"]);
  }
  const reasons = formRefusals(news);
  if (reasons.length > 0) {
    yield* refuseVm(news, reasons);
  }
  yield* validatePropertyStrings("qemu", { ...news });
  if (olds !== undefined) {
    yield* validatePropertyStrings("qemu", { ...olds });
  }
  yield* validateDiskSizes(news, olds);
  yield* guardUpdate(news);
});
export const checkVmAdoption = Effect.fn(function* checkVmAdoptionEffect(
  props: VmProps,
  live: VmAttributes,
) {
  const { drift } = judge(props, live.config);
  if (drift.length > 0) {
    yield* refuseVm(props, ["Adoption differs in the named keys; adoption never writes."], drift);
  }
});
export const deleteQemu = Effect.fn(function* deleteQemuEffect(props: VmProps) {
  const live = yield* readQemu(props);
  if (live === undefined) {
    return;
  }
  const { drift } = judge(props, live.config);
  if (drift.length > 0) {
    yield* refuseVm(
      props,
      ["The guest no longer matches its last declaration. Nothing was deleted."],
      drift,
    );
  }
  yield* qemuTask(
    props,
    nodes.deleteNodeQemu({ node: props.node, vmid: String(props.vmid) }),
    "destroy VM",
    60,
  );
});
