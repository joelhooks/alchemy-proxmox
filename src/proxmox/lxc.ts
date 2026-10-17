// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Resource } from "alchemy";
import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { createForm, createRefusals } from "./lxc-create-form.ts";
import { LxcRefusedError } from "./lxc-errors.ts";
import { identityRefusals } from "./lxc-identity.ts";
import { judge } from "./lxc-judge.ts";
import { attributesOf, createGuest, destroyGuest, readLive, updateGuest } from "./lxc-lifecycle.ts";
import type { LxcAttributes, LxcProps } from "./lxc-props.ts";
import type { PveRequirements } from "./resource.ts";
import { guardForm } from "./constraint-guard.ts";
import { requireRecreation } from "./missing-guest.ts";
import { hasTag, requireOwnership, withTag, OwnershipTagStampFailed } from "./ownership.ts";
import * as nodes from "@distilled.cloud/proxmox/nodes";
import { runPve } from "./distilled-pve.ts";
import { tagSet } from "./lxc-wire.ts";
import { text } from "./values.ts";
import { taggedGuests } from "./discovery.ts";

export type { LxcAttributes, LxcProps } from "./lxc-props.ts";

// oxlint-disable-next-line no-redeclare -- Alchemy resources intentionally share a name in TypeScript's type and value namespaces.
export type Lxc = Resource<"Proxmox.Lxc", LxcProps, LxcAttributes, never, PveRequirements>;
export const Lxc = Resource<Lxc>("Proxmox.Lxc", { defaultRemovalPolicy: "retain" });

const refuse = (props: LxcProps, reasons: readonly string[], keys: readonly string[] = []) =>
  Effect.fail(new LxcRefusedError({ keys, node: props.node, reasons, vmid: props.vmid }));
const effective = (props: LxcProps, fqn: string, live: Record<string, unknown>): LxcProps =>
  hasTag(fqn, text(live.tags))
    ? withTag({ ...props, tags: props.tags ?? text(live.tags) }, fqn)
    : props;
const createGuard = Effect.fn(function* createGuardEffect(props: LxcProps) {
  const reasons = createRefusals(props);
  if (reasons.length > 0) {
    yield* refuse(props, reasons);
  }
  yield* guardForm("pve:POST /nodes/{node}/lxc", createForm(props), true);
});
const checkAdoption = Effect.fn(function* checkAdoptionEffect(
  props: LxcProps,
  live: Record<string, unknown>,
) {
  const change = judge(props, live);
  if (change.drift.length > 0) {
    yield* refuse(
      props,
      ["Adoption differs in the named keys; adoption never writes."],
      change.drift,
    );
  }
});

// Created -> read digest -> stamp tags -> verify -> record output. Failure leaves the guest intact.
const stampCreatedOwnership = (props: LxcProps, fqn: string) =>
  Effect.gen(function* stampCreatedOwnershipEffect() {
    const created = yield* readLive(props);
    if (created === undefined) {
      return yield* refuse(props, ["Created guest is absent before ownership tagging."], ["tags"]);
    }
    const tagged = withTag({ ...props, tags: props.tags ?? text(created.tags) }, fqn);
    yield* runPve(
      nodes.putNodeLxcConfig({
        digest: text(created.digest),
        node: props.node,
        tags: text(tagged.tags),
        vmid: String(props.vmid),
      }),
    );
    const confirmed = yield* readLive(props);
    if (
      confirmed === undefined ||
      !hasTag(fqn, text(confirmed.tags)) ||
      tagSet(text(confirmed.tags)) !== tagSet(text(tagged.tags))
    ) {
      return yield* refuse(
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

export const LxcProvider = () =>
  Provider.succeed(Lxc, {
    delete: Effect.fn(function* deleteGuestEffect({ fqn, olds, output }) {
      const where = { ...olds, node: output.node, vmid: output.vmid };
      const live = yield* readLive(where);
      if (live === undefined) {
        return;
      }
      yield* destroyGuest(where, effective(olds, fqn, live));
    }),
    diff: Effect.fn(function* diffEffect({ fqn, news, olds, output }) {
      const identity = identityRefusals(news, olds, output);
      if (identity.length > 0) {
        yield* refuse(
          olds,
          identity.map(({ reason }) => reason),
          identity.map(({ key }) => key),
        );
      }
      if (!isResolved(news)) {
        // oxlint-disable-next-line unicorn/no-useless-undefined -- Alchemy optional read/diff results are explicitly undefined, not void.
        return undefined;
      }
      const live = yield* readLive(news);
      if (live === undefined) {
        yield* requireRecreation(news);
        yield* createGuard(news);
        return { action: "update" } as const;
      }
      const change = judge(effective(news, fqn, live), live);
      if (change.refuse.length > 0) {
        yield* refuse(news, change.refuse, change.drift);
      }
      return { action: change.drift.length === 0 ? "noop" : "update" } as const;
    }),
    list: Effect.fn(function* listEffect() {
      const guests = yield* taggedGuests("lxc");
      const found = yield* Effect.all(
        guests.map((guest) =>
          Effect.gen(function* readListedEffect() {
            const config = yield* readLive(guest);
            return config === undefined ? undefined : attributesOf(guest, config);
          }),
        ),
      );
      return found.filter((guest) => guest !== undefined);
    }),
    read: Effect.fn(function* readEffect({ fqn, olds, output }) {
      const where = { ...olds, node: output?.node ?? olds.node, vmid: output?.vmid ?? olds.vmid };
      const live = yield* readLive(where);
      if (live === undefined) {
        if (output !== undefined) {
          yield* requireRecreation(olds);
        }
        yield* createGuard(olds);
        // oxlint-disable-next-line unicorn/no-useless-undefined -- Alchemy optional read/diff results are explicitly undefined, not void.
        return undefined;
      }
      const declared = effective(olds, fqn, live);
      const tagged = hasTag(fqn, text(live.tags));
      if (output === undefined && !tagged) {
        yield* checkAdoption(declared, live);
      }
      const attrs = attributesOf(where, live);
      return output !== undefined || tagged ? attrs : Unowned(attrs);
    }),
    reconcile: Effect.fn(function* reconcileEffect({ fqn, news, olds, output }) {
      const identity = identityRefusals(news, olds ?? news, output);
      if (identity.length > 0) {
        yield* refuse(
          news,
          identity.map(({ reason }) => reason),
          identity.map(({ key }) => key),
        );
      }
      const live = yield* readLive(news);
      let declared = news;
      if (live === undefined) {
        if (output !== undefined || olds !== undefined) {
          yield* requireRecreation(news);
        }
        // Pool-scoped tag permission is available only after the create task adds membership.
        const untagged = { ...news, tags: undefined };
        yield* createGuard(untagged);
        yield* createGuest(untagged);
        declared = yield* stampCreatedOwnership(news, fqn);
      } else {
        const tagged = hasTag(fqn, text(live.tags));
        yield* requireOwnership(fqn, "Proxmox.Lxc", output !== undefined || tagged);
        declared = effective(news, fqn, live);
        const change = judge(declared, live);
        // beta.83 passes no old props on adoption, even though it supplies the observed attributes.
        if (output === undefined || olds === undefined) {
          yield* checkAdoption(declared, live);
        }
        if (change.refuse.length > 0) {
          yield* refuse(news, change.refuse, change.drift);
        }
        if (change.drift.length > 0) {
          yield* updateGuest(declared, change, text(live.digest));
        }
      }
      const after = yield* readLive(news);
      if (after === undefined) {
        return yield* refuse(news, ["The write returned success but the guest is still absent."]);
      }
      const left = judge(declared, after).drift;
      if (left.length > 0) {
        yield* refuse(
          news,
          ["After the write the named keys still differ; declare the config PVE stores."],
          left,
        );
      }
      return attributesOf(news, after);
    }),
    // Only top-level identity outputs are stable; nested immutable config is checked by diff.
    stables: ["node", "vmid"],
  });
