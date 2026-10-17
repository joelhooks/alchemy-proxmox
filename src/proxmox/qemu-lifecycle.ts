// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-lifecycle.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { isResolved } from "alchemy/Diff";
import type { Input } from "alchemy/Input";
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import { type Owner, refuseTakeover } from "../ownership/adopt.ts";
import { adopting } from "../ownership/adopting.ts";
import { ownedRead } from "../ownership/probe.ts";
import { runPve } from "./distilled-pve.ts";
import { createForm, formRefusals } from "./qemu-form.ts";
import { QemuRefusedError } from "./qemu-errors.ts";
import { identityRefusal, judge, type VmChange } from "./qemu-judge.ts";
import type { VmAttributes, VmProps } from "./qemu-props.ts";
import { readVm } from "./qemu-read.ts";
import { qemuTask } from "./qemu-task.ts";
import { attributesOf, guardCreate, guardUpdate } from "./qemu-spec.ts";
import { checkLiveDiskSizes, validateDiskSizes } from "./qemu-size.ts";
import { resizeDisks } from "./qemu-resize.ts";

const refused = (message: string) => Effect.fail(new QemuRefusedError(message));
type VmOwner = Owner & { readonly output: VmAttributes | undefined };
type Asked = { readonly fqn: string; readonly instanceId: string };

export const readQemu = (props: VmProps) =>
  readVm(props).pipe(
    Effect.map((live) =>
      live === undefined
        ? undefined
        : attributesOf(live as unknown as Record<string, unknown>, props),
    ),
  );

const validate = (news: VmProps, olds?: VmProps, output?: VmAttributes) =>
  Effect.gen(function* () {
    const identity = identityRefusal(news.vmid, output?.vmid ?? olds?.vmid);
    if (identity !== undefined) return yield* refused(identity);
    const node = output?.node ?? olds?.node;
    if (node !== undefined && news.node !== node)
      return yield* refused(
        "node: this resource never migrates a VM. Move it by hand and import it as a new resource.",
      );
    if (olds !== undefined && news.pool !== olds.pool)
      return yield* refused(
        "pool: moving a guest between pools is an operator action.",
      );
    const reasons = formRefusals(news);
    if (reasons.length > 0) return yield* refused(reasons.join("\n"));
    yield* validateDiskSizes(news, olds);
    yield* guardUpdate(news);
  });

const refuseChange = (change: VmChange) =>
  change.refuse.length === 0 ? Effect.void : refused(change.refuse.join("\n"));

const refuseAdoptedDrift = (
  owner: VmOwner,
  props: VmProps,
  live: VmAttributes,
  change: VmChange,
) =>
  Effect.gen(function* () {
    if (change.drift.length === 0) return;
    const settled = (recorded: unknown) =>
      Effect.sync(
        () => judge(recorded as VmProps, live.config).drift.length === 0,
      );
    if (owner.output === undefined || (yield* adopting(owner, settled))) {
      return yield* refused(
        `Adoption differs in ${change.drift.join(", ")}. Declare the live config; adoption never writes.`,
      );
    }
  });

export const deleteQemu = (props: VmProps) =>
  Effect.gen(function* () {
    const live = yield* readQemu(props);
    if (live === undefined) return;
    const drift = judge(props, live.config).drift;
    if (drift.length > 0)
      return yield* refused(
        `Delete refused: the guest no longer matches its last declaration (${drift.join(", ")}). Nothing was deleted.`,
      );
    yield* qemuTask(
      props,
      nodes.deleteNodeQemu({ node: props.node, vmid: String(props.vmid) }),
      "destroy VM",
      60,
    );
  });

export const qemuHandlers = {
  list: () => Effect.succeed([]),
  read: Effect.fn(function* ({
    fqn,
    instanceId,
    olds,
    output,
  }: Asked & { olds: VmProps; output: VmAttributes | undefined }) {
    yield* validate(olds);
    const found = yield* readQemu(olds);
    if (found === undefined) {
      yield* guardCreate(olds, true);
      return undefined;
    }
    const change = judge(olds, found.config);
    if (output === undefined && change.drift.length > 0) {
      return yield* refused(
        `Adoption differs in ${change.drift.join(", ")}. Declare the live config; adoption never writes.`,
      );
    }
    return yield* ownedRead(
      { fqn, instanceId, output },
      found,
      Effect.sync(() => change.drift.length === 0),
    );
  }),
  diff: Effect.fn(function* ({
    fqn,
    instanceId,
    news,
    olds,
    output,
  }: Asked & {
    news: Input<VmProps>;
    olds: VmProps;
    output: VmAttributes | undefined;
  }) {
    if (!isResolved(news)) return undefined;
    yield* validate(news, olds, output);
    const live = yield* readQemu(news);
    if (live === undefined) {
      yield* guardCreate(news, true);
      if (output === undefined) return undefined;
      yield* Effect.logWarning(
        "The VM is absent. Deploy creates it again with new, empty volumes.",
      );
      return { action: "update" } as const;
    }
    const change = judge(news, live.config);
    yield* refuseAdoptedDrift({ fqn, instanceId, output }, news, live, change);
    yield* checkLiveDiskSizes(news, live.config, true);
    yield* refuseChange(change);
    return { action: change.drift.length === 0 ? "noop" : "update" } as const;
  }),
  reconcile: Effect.fn(function* ({
    fqn,
    instanceId,
    news,
    olds,
    output,
  }: Asked & {
    news: VmProps;
    olds: VmProps | undefined;
    output: VmAttributes | undefined;
  }) {
    yield* validate(news, olds, output);
    const live = yield* readQemu(news);
    if (live === undefined) {
      yield* guardCreate(news, true);
      yield* qemuTask(
        news,
        nodes.createNodeQemu({ ...createForm(news), node: news.node }),
        "create VM",
        180,
      );
    } else {
      yield* refuseTakeover({ fqn, instanceId, output }, "Proxmox.Vm");
      const change = judge(news, live.config);
      yield* refuseAdoptedDrift(
        { fqn, instanceId, output },
        news,
        live,
        change,
      );
      yield* checkLiveDiskSizes(news, live.config, true);
      yield* refuseChange(change);
      if (Object.keys(change.put).length > 0) {
        yield* runPve(
          nodes.putNodeQemuConfig({
            ...change.put,
            digest: live.digest,
            node: news.node,
            vmid: String(news.vmid),
          }),
        );
      }
    }
    yield* resizeDisks(news);
    const after = yield* readQemu(news);
    if (after === undefined)
      return yield* refused(
        "Write returned success but the VM is still absent.",
      );
    const left = judge(news, after.config).drift;
    if (left.length > 0)
      return yield* refused(
        `After the write, ${left.join(", ")} still differ. Declare the config PVE stores.`,
      );
    return after;
  }),
  delete: ({ olds, output }: { olds: VmProps; output: VmAttributes }) =>
    deleteQemu({ ...olds, node: output.node, vmid: output.vmid }),
};
