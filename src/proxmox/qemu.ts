// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu.ts and qemu-lifecycle.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Resource } from "alchemy";
import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import type { Providers } from "../providers.ts";
import type { VmAttributes, VmProps } from "./qemu-props.ts";
import { checkVmAdoption, deleteQemu, readQemu, refuseVm, validateVm } from "./qemu-lifecycle.ts";
import { createForm } from "./qemu-form.ts";
import { judge } from "./qemu-judge.ts";
import { qemuTask } from "./qemu-task.ts";
import { guardCreate } from "./qemu-spec.ts";
import { taggedGuests } from "./discovery.ts";
import { checkLiveDiskSizes } from "./qemu-size.ts";
import { resizeDisks } from "./qemu-resize.ts";
import { runPve } from "./distilled-pve.ts";
import { requireRecreation } from "./missing-guest.ts";
import { hasTag, requireOwnership, withTag, OwnershipTagStampFailed } from "./ownership.ts";
import { tagSet } from "./lxc-wire.ts";

export type { VmAttributes, VmProps } from "./qemu-props.ts";

// oxlint-disable-next-line no-redeclare -- Alchemy resources intentionally share a name in TypeScript's type and value namespaces.
export type Vm = Resource<"Proxmox.Vm", VmProps, VmAttributes, never, Providers>;
export const Vm = Resource<Vm>("Proxmox.Vm", { defaultRemovalPolicy: "retain" });
const effective = (props: VmProps, fqn: string, live: VmAttributes): VmProps =>
  hasTag(fqn, live.config.tags)
    ? withTag({ ...props, tags: props.tags ?? live.config.tags ?? "" }, fqn)
    : props;

// Created -> read digest -> stamp tags -> verify -> record output. Failure leaves the guest intact.
const stampCreatedOwnership = (props: VmProps, fqn: string) =>
  Effect.gen(function* stampCreatedOwnershipEffect() {
    const created = yield* readQemu(props);
    if (created === undefined) {
      return yield* refuseVm(
        props,
        ["Created guest is absent before ownership tagging."],
        ["tags"],
      );
    }
    const tagged = withTag({ ...props, tags: props.tags ?? created.config.tags ?? "" }, fqn);
    yield* runPve(
      nodes.putNodeQemuConfig({
        digest: created.digest,
        node: props.node,
        tags: tagged.tags,
        vmid: String(props.vmid),
      }),
    );
    const confirmed = yield* readQemu(props);
    if (
      confirmed === undefined ||
      !hasTag(fqn, confirmed.config.tags) ||
      tagSet(confirmed.config.tags ?? "") !== tagSet(tagged.tags ?? "")
    ) {
      return yield* refuseVm(
        props,
        ["Ownership tag write was not confirmed by a fresh read."],
        ["tags"],
      );
    }
    return tagged;
  }).pipe(
    Effect.mapError(
      (cause) => new OwnershipTagStampFailed({ cause, node: props.node, vmid: props.vmid }),
    ),
  );

export const VmProvider = () =>
  Provider.succeed(Vm, {
    delete: Effect.fn(function* deleteGuestEffect({ fqn, olds, output }) {
      const props = { ...olds, node: output.node, vmid: output.vmid };
      const live = yield* readQemu(props);
      if (live === undefined) {
        return;
      }
      yield* deleteQemu(effective(props, fqn, live));
    }),
    diff: Effect.fn(function* diffEffect({ fqn, news, olds, output }) {
      if (!isResolved(news)) {
        // oxlint-disable-next-line unicorn/no-useless-undefined -- Alchemy optional read/diff results are explicitly undefined, not void.
        return undefined;
      }
      yield* validateVm(news, olds, output);
      const live = yield* readQemu(news);
      if (live === undefined) {
        yield* requireRecreation(news);
        yield* guardCreate(news, true);
        return { action: "update" } as const;
      }
      const change = judge(effective(news, fqn, live), live.config);
      if (change.refuse.length > 0) {
        yield* refuseVm(news, change.refuse, change.drift);
      }
      yield* checkLiveDiskSizes(news, live.config, true);
      return { action: change.drift.length === 0 ? "noop" : "update" } as const;
    }),
    list: Effect.fn(function* listEffect() {
      const guests = yield* taggedGuests("qemu");
      const found = yield* Effect.all(
        guests.map((guest) => readQemu(guest)),
        { concurrency: 4 },
      );
      return found.filter((guest) => guest !== undefined);
    }),
    read: Effect.fn(function* readEffect({ fqn, olds, output }) {
      yield* validateVm(olds);
      const live = yield* readQemu(olds);
      if (live === undefined) {
        if (output !== undefined) {
          yield* requireRecreation(olds);
        }
        yield* guardCreate(olds, true);
        // oxlint-disable-next-line unicorn/no-useless-undefined -- Alchemy optional read/diff results are explicitly undefined, not void.
        return undefined;
      }
      const tagged = hasTag(fqn, live.config.tags);
      if (output === undefined && !tagged) {
        yield* checkVmAdoption(olds, live);
      }
      return output !== undefined || tagged ? live : Unowned(live);
    }),
    reconcile: Effect.fn(function* reconcileEffect({ fqn, news, olds, output }) {
      yield* validateVm(news, olds, output);
      const live = yield* readQemu(news);
      let declared = news;
      if (live === undefined) {
        if (output !== undefined || olds !== undefined) {
          yield* requireRecreation(news);
        }
        // Pool-scoped tag permission is available only after the create task adds membership.
        const untagged = { ...news };
        delete untagged.tags;
        yield* guardCreate(untagged, true);
        yield* qemuTask(
          untagged,
          nodes.createNodeQemu({ ...createForm(untagged), node: news.node }),
          "create VM",
          180,
        );
        declared = yield* stampCreatedOwnership(news, fqn);
      } else {
        const tagged = hasTag(fqn, live.config.tags);
        yield* requireOwnership(fqn, "Proxmox.Vm", output !== undefined || tagged);
        declared = effective(news, fqn, live);
        if (output === undefined || olds === undefined) {
          yield* checkVmAdoption(declared, live);
        }
        const change = judge(declared, live.config);
        if (change.refuse.length > 0) {
          yield* refuseVm(news, change.refuse, change.drift);
        }
        yield* checkLiveDiskSizes(news, live.config, true);
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
      yield* resizeDisks(declared);
      const after = yield* readQemu(news);
      if (after === undefined) {
        return yield* refuseVm(news, ["Write returned success but the VM is still absent."]);
      }
      const left = judge(declared, after.config).drift;
      if (left.length > 0) {
        yield* refuseVm(news, ["After the write the named keys still differ."], left);
      }
      return after;
    }),
    // Only top-level identity outputs are stable; nested immutable config is checked by diff.
    stables: ["node", "vmid"],
  });
