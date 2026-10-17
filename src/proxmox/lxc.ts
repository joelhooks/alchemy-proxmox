// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Resource } from "alchemy";
import { isResolved } from "alchemy/Diff";
import type { Input } from "alchemy/Input";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { type Owner, refuseTakeover } from "../ownership/adopt.ts";
import { ownedRead } from "../ownership/probe.ts";
import { provingResumes } from "../ownership/resume.ts";
import { createRefusals, createForm } from "./lxc-create-form.ts";
import { guardForm } from "./constraint-guard.ts";
import { identityRefusals } from "./lxc-identity.ts";
import { refuseAdoptedDrift } from "./lxc-adoption.ts";
import { judge } from "./lxc-judge.ts";
import {
  LxcRefusedError,
  type LxcWhere,
  attributesOf,
  createGuest,
  destroyGuest,
  readLive,
  updateGuest,
} from "./lxc-lifecycle.ts";
import type { LxcAttributes, LxcProps } from "./lxc-props.ts";
import type { PveRequirements } from "./resource.ts";
import { text } from "./values.ts";
export type { LxcAttributes, LxcProps } from "./lxc-props.ts";
export interface Lxc extends Resource<
  "Proxmox.Lxc",
  LxcProps,
  LxcAttributes,
  never,
  PveRequirements
> {}
export const Lxc = Resource<Lxc>("Proxmox.Lxc", {
  defaultRemovalPolicy: "retain",
});
type LxcOwner = Owner & {
  readonly output: LxcAttributes | undefined;
};
const refused = (reasons: readonly string[]) =>
  Effect.fail(new LxcRefusedError(reasons.join("\n")));
const diff = (owner: LxcOwner, news: Input<LxcProps>, olds: LxcProps) =>
  Effect.gen(function* () {
    const { output } = owner;
    const identity = identityRefusals(news, olds, output);
    if (identity.length > 0) return yield* refused(identity);
    if (output === undefined) return undefined;
    if (!isResolved(news)) return undefined;
    const live = yield* readLive(news);
    if (live === undefined) {
      const refusals = createRefusals(news);
      if (refusals.length > 0) return yield* refused(refusals);
      yield* Effect.logWarning(
        `Proxmox.Lxc ${news.node}/${String(news.vmid)}: the cluster lists no guest with this ` +
          "vmid -- a deploy CREATES it again from ostemplate, with new, empty volumes.",
      );
      return { action: "update" } as const;
    }
    const change = judge(news, live);
    yield* refuseAdoptedDrift(owner, news, live, change);
    if (change.refuse.length > 0) return yield* refused(change.refuse);
    if (change.drift.length === 0) return { action: "noop" } as const;
    const what = `live config differs in ${change.drift.join(", ")} -- deploy writes these keys.`;
    yield* Effect.logWarning(
      `Proxmox.Lxc ${news.node}/${String(news.vmid)}: ${what}`,
    );
    return { action: "update" } as const;
  });
const reconcile = (owner: LxcOwner, news: LxcProps, olds?: LxcProps) =>
  Effect.gen(function* () {
    const { output } = owner;
    const identity = identityRefusals(news, olds ?? news, output);
    if (identity.length > 0) return yield* refused(identity);
    const live = yield* readLive(news);
    if (live === undefined) {
      const refusals = createRefusals(news);
      if (refusals.length > 0) return yield* refused(refusals);
      yield* createGuest(news);
    } else {
      if (output === undefined) {
        yield* refuseTakeover(
          owner,
          `Proxmox.Lxc CT ${String(news.vmid)} on ${news.node}`,
        );
      }
      const change = judge(news, live);
      if (output === undefined && change.drift.length > 0) {
        return yield* refused([
          `CT ${String(news.vmid)} already exists on ${news.node} and differs in ` +
            `${change.drift.join(", ")}, but this deploy planned a create. A create never writes ` +
            "onto an existing guest: plan again, so the plan can show it and adopt it.",
        ]);
      }
      yield* refuseAdoptedDrift(owner, news, live, change);
      if (change.refuse.length > 0) return yield* refused(change.refuse);
      if (change.drift.length > 0)
        yield* updateGuest(news, change, text(live["digest"]));
    }
    const after = yield* readLive(news);
    if (after === undefined) {
      return yield* refused([
        `CT ${String(news.vmid)}: the write returned no error but the guest is still absent.`,
      ]);
    }
    const left = judge(news, after).drift;
    if (left.length > 0) {
      return yield* refused([
        `CT ${String(news.vmid)}: after the write, ${left.join(", ")} still differ from the ` +
          "declaration. PVE may have normalised the value (tags are lower-cased by default) -- " +
          "declare what it stores.",
      ]);
    }
    return attributesOf(news, after);
  });
const whereOf = (
  olds: LxcProps,
  output: LxcAttributes | undefined,
): LxcWhere => ({
  node: output?.node ?? olds.node,
  pool: olds.pool,
  vmid: output?.vmid ?? olds.vmid,
});
const read = (owner: LxcOwner, olds: LxcProps) =>
  Effect.gen(function* () {
    const where = whereOf(olds, owner.output);
    const live = yield* readLive(where);
    if (live === undefined) {
      const reasons = createRefusals(olds);
      if (reasons.length > 0) return yield* refused(reasons);
      yield* guardForm("pve:POST /nodes/{node}/lxc", createForm(olds), true);
      return undefined;
    }
    // The adoption probe must reject drift before Alchemy can record this guest as owned.
    const change = judge(olds, live);
    if (owner.output === undefined && change.drift.length > 0) {
      return yield* refused([
        `Adoption differs in ${change.drift.join(", ")}. Declare the live config; adoption never writes.`,
      ]);
    }
    const settled = Effect.sync(() => judge(olds, live).drift.length === 0);
    return yield* ownedRead(owner, attributesOf(where, live), settled);
  });
type Asked = {
  readonly fqn: string;
  readonly instanceId: string;
};
const handlers = {
  delete: ({ olds, output }: { olds: LxcProps; output: LxcAttributes }) =>
    destroyGuest(whereOf(olds, output), olds),
  diff: ({
    fqn,
    instanceId,
    news,
    olds,
    output,
  }: Asked & {
    news: Input<LxcProps>;
    olds: LxcProps;
    output: LxcAttributes | undefined;
  }) => diff({ fqn, instanceId, output }, news, olds),
  list: () => Effect.succeed([]),
  read: ({
    fqn,
    instanceId,
    olds,
    output,
  }: Asked & {
    olds: LxcProps;
    output: LxcAttributes | undefined;
  }) => read({ fqn, instanceId, output }, olds),
  reconcile: ({
    fqn,
    instanceId,
    news,
    olds,
    output,
  }: Asked & {
    news: LxcProps;
    olds: LxcProps | undefined;
    output: LxcAttributes | undefined;
  }) => reconcile({ fqn, instanceId, output }, news, olds),
};
export const LxcProvider = () =>
  Provider.effect(
    Lxc,
    Effect.succeed(Lxc.Provider.of(handlers)).pipe(Effect.map(provingResumes)),
  );
