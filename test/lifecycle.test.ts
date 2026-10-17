import { describe, expect, it } from "@effect/vitest";
import { AdoptPolicy } from "alchemy/AdoptPolicy";
import { scratchStack, toEffect } from "alchemy/Test/Core";
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as TestClock from "effect/testing/TestClock";
import { CredentialsFromEnv } from "../src/credentials.ts";
import { Providers, providers } from "../src/providers.ts";
import { runPve } from "../src/proxmox/distilled-pve.ts";
import { judge } from "../src/proxmox/lxc-judge.ts";
import { Lxc } from "../src/proxmox/lxc.ts";
import { createGuest, destroyGuest, readLive, updateGuest } from "../src/proxmox/lxc-lifecycle.ts";
import { lxcTask } from "../src/proxmox/lxc-task.ts";
import type { LxcProps } from "../src/proxmox/lxc-props.ts";

const required = [
  "PROXMOX_URL",
  "PROXMOX_TOKEN_ID",
  "PROXMOX_TOKEN_SECRET",
  "PROXMOX_NODE",
  "PROXMOX_VMID",
  "PROXMOX_POOL",
  "PROXMOX_STORAGE",
  "PROXMOX_TEMPLATE",
  "PROXMOX_BRIDGE",
] as const;
const missing = required.filter((key) => process.env[key] === undefined || process.env[key] === "");
const enabled = process.env.PROXMOX_LIVE === "1" && missing.length === 0;
const skipReason = missing.length > 0 ? `unset ${missing.join(", ")}` : "PROXMOX_LIVE is not 1";
if (!enabled) {
  console.warn(`SKIP real PVE lifecycle: ${skipReason}. No API calls made.`);
}
const env = (key: (typeof required)[number]): string => {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing ${key}`);
  }
  return value;
};
const config = (live: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (live === undefined) {
    throw new Error("Expected the throwaway guest to exist.");
  }
  return live;
};
const options = { dev: false, providers: providers(), sidecar: false, stage: "test" };
const listGuests = Effect.gen(function* listGuestsEffect() {
  const collection = yield* Providers;
  const provider = collection.get<Lxc>(Lxc.Type);
  if (provider === undefined) {
    throw new Error("LXC provider is missing from its collection.");
  }
  return yield* provider.list();
}).pipe(Effect.provide(providers()));
const tasks = Effect.fn(function* guestTasksEffect(props: LxcProps) {
  const ids: string[] = [];
  for (let start = 0; ; start += 1000) {
    const page = yield* runPve(
      nodes.listNodeTasks({
        limit: "1000",
        node: props.node,
        source: "all",
        start: String(start),
        vmid: String(props.vmid),
      }),
    );
    ids.push(...page.map((row) => row.upid));
    if (page.length < 1000) {
      return ids.toSorted();
    }
  }
});

describe.skipIf(!enabled)(
  enabled ? "real PVE lifecycle and native adoption" : `SKIP real PVE: ${skipReason}; no API calls`,
  () => {
    it.effect(
      "lifecycle; exact and mismatched adoption; second-plan noop; missing guest refusal",
      () =>
        toEffect(
          Effect.gen(function* liveGuestCasesEffect() {
            const vmid = Number(env("PROXMOX_VMID"));
            if (!Number.isSafeInteger(vmid) || vmid <= 0) {
              throw new Error("PROXMOX_VMID must be a positive integer");
            }
            const props: LxcProps = {
              features: "nesting=1",
              memory: 256,
              net0: `name=eth0,bridge=${env("PROXMOX_BRIDGE")},ip=dhcp`,
              node: env("PROXMOX_NODE"),
              onboot: 0,
              ostemplate: env("PROXMOX_TEMPLATE"),
              pool: env("PROXMOX_POOL"),
              rootfs: `${env("PROXMOX_STORAGE")}:4`,
              start: 0,
              unprivileged: 1,
              vmid,
            };
            expect(yield* readLive(props)).toBeUndefined();
            const initialTasks = yield* tasks(props);
            yield* createGuest(props);
            const created = config(yield* readLive(props));
            expect(judge(props, created).drift).toEqual([]);
            expect((yield* tasks(props)).length).toBeGreaterThan(initialTasks.length);
            const updated = { ...props, memory: 512 };
            yield* updateGuest(updated, judge(updated, created), String(created.digest));
            const changed = config(yield* readLive(updated));
            expect(judge(updated, changed).drift).toEqual([]);
            yield* runPve(
              nodes.putNodeLxcConfig({
                digest: String(changed.digest),
                memory: "768",
                node: props.node,
                vmid: String(vmid),
              }),
            );
            const drifted = config(yield* readLive(updated));
            expect(judge(updated, drifted).drift).toContain("memory");
            expect(yield* destroyGuest(updated, updated).pipe(Effect.isFailure)).toBe(true);
            yield* updateGuest(updated, judge(updated, drifted), String(drifted.digest));
            yield* destroyGuest(updated, updated);
            expect(yield* readLive(updated)).toBeUndefined();

            // Create out of band so the native engine must ask to adopt; never stamp a tag during adoption.
            yield* createGuest(props);
            const adoptionBaseline = config(yield* readLive(props));
            const adoptionTasks = yield* tasks(props);
            const adopted = scratchStack(options, "proxmox-live-adoption");
            const declaration = Lxc("Guest", props);
            const unowned = yield* adopted
              .plan(declaration)
              .pipe(Effect.provideService(AdoptPolicy, false), Effect.result);
            expect(unowned).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "OwnedBySomeoneElse" },
            });
            const mismatch = yield* adopted
              .plan(Lxc("Guest", { ...props, memory: 512 }))
              .pipe(Effect.provideService(AdoptPolicy, true), Effect.result);
            expect(mismatch).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "LxcRefusedError", keys: ["memory"] },
            });
            expect(yield* readLive(props)).toEqual(adoptionBaseline);
            expect(yield* tasks(props)).toEqual(adoptionTasks);
            const exact = yield* adopted
              .plan(declaration)
              .pipe(Effect.provideService(AdoptPolicy, true));
            expect(Object.values(exact.resources).map((row) => row.action)).toEqual(["adopted"]);
            yield* adopted.deploy(declaration).pipe(Effect.provideService(AdoptPolicy, true));
            expect(yield* readLive(props)).toEqual(adoptionBaseline);
            expect(
              (yield* listGuests).some((guest) => guest.vmid === vmid && guest.node === props.node),
            ).toBe(false);
            expect(yield* tasks(props)).toEqual(adoptionTasks);
            const second = yield* adopted
              .plan(declaration)
              .pipe(Effect.provideService(AdoptPolicy, false));
            expect(Object.values(second.resources).map((row) => row.action)).toEqual(["noop"]);
            expect(yield* tasks(props)).toEqual(adoptionTasks);
            yield* destroyGuest(props, props);

            const managed = scratchStack(options, "proxmox-live-missing");
            yield* managed.deploy(Lxc("Guest", props));
            const owned = config(yield* readLive(props));
            expect(String(owned.tags)).toContain("alchemy-");
            expect(
              (yield* listGuests).find((guest) => guest.vmid === vmid && guest.node === props.node),
            ).toMatchObject({ node: props.node, vmid });
            // Omitted user tags stay unmanaged; internal ownership metadata must not manufacture drift.
            yield* runPve(
              nodes.putNodeLxcConfig({
                digest: String(owned.digest),
                node: props.node,
                tags: `${String(owned.tags)};operator-note`,
                vmid: String(vmid),
              }),
            );
            const tagBaseline = config(yield* readLive(props));
            const tagTasks = yield* tasks(props);
            const taggedPlan = yield* managed.plan(Lxc("Guest", props));
            expect(Object.values(taggedPlan.resources).map((row) => row.action)).toEqual(["noop"]);
            expect(yield* readLive(props)).toEqual(tagBaseline);
            expect(yield* tasks(props)).toEqual(tagTasks);
            const managedProps = { ...props, memory: 512 };
            yield* managed.deploy(Lxc("Guest", managedProps));
            expect(config(yield* readLive(props)).tags).toBe(tagBaseline.tags);
            yield* lxcTask(
              props,
              nodes.deleteNodeLxc({ node: props.node, vmid: String(vmid) }),
              "out-of-band delete",
              60,
            );
            const missingTasks = yield* tasks(props);
            const missingPlan = yield* managed.plan(Lxc("Guest", managedProps)).pipe(Effect.result);
            expect(missingPlan).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "MissingGuest" },
            });
            expect(yield* tasks(props)).toEqual(missingTasks);
            expect(yield* readLive(props)).toBeUndefined();
          }).pipe(Effect.provide(CredentialsFromEnv), Effect.provide(FetchHttpClient.layer)),
          options,
        ).pipe(TestClock.withLive),
      { timeout: 600_000 },
    );
  },
);
