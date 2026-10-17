import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { expect, it } from "vitest";
import { CredentialsFromEnv } from "../src/Credentials.ts";
import { runPve } from "../src/proxmox/distilled-pve.ts";
import { judge } from "../src/proxmox/lxc-judge.ts";
import {
  createGuest,
  destroyGuest,
  readLive,
  updateGuest,
} from "../src/proxmox/lxc-lifecycle.ts";
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
const missing = required.filter((key) => !process.env[key]);
const enabled = process.env.PROXMOX_LIVE === "1" && missing.length === 0;
if (!enabled) {
  console.warn(
    `SKIP real PVE lifecycle: ${missing.length > 0 ? `unset ${missing.join(", ")}` : "set PROXMOX_LIVE=1 to authorize a throwaway guest"}. No API calls made.`,
  );
}

it.skipIf(!enabled)(
  enabled
    ? "real LXC create → read → update → detect drift → delete → absent"
    : `SKIP real PVE lifecycle: ${missing.length > 0 ? `unset ${missing.join(", ")}` : "PROXMOX_LIVE is not 1"}; no API calls`,
  async () => {
    const env = (key: (typeof required)[number]): string => process.env[key]!;
    const vmid = Number(env("PROXMOX_VMID"));
    if (!Number.isSafeInteger(vmid) || vmid <= 0)
      throw new Error("PROXMOX_VMID must be a positive integer");
    const props: LxcProps = {
      node: env("PROXMOX_NODE"),
      vmid,
      pool: env("PROXMOX_POOL"),
      ostemplate: env("PROXMOX_TEMPLATE"),
      rootfs: `${env("PROXMOX_STORAGE")}:4`,
      net0: `name=eth0,bridge=${env("PROXMOX_BRIDGE")},ip=dhcp`,
      unprivileged: 1,
      start: 0,
      onboot: 0,
      memory: 256,
    };
    await Effect.runPromise(
      Effect.gen(function* () {
        // Refuse a pre-existing guest. This test never adopts or cleans up somebody else's guest.
        expect(yield* readLive(props)).toBeUndefined();
        yield* createGuest(props);
        const created = yield* readLive(props);
        expect(created).toBeDefined();
        expect(judge(props, created!).drift).toEqual([]);

        const updated = { ...props, memory: 512 };
        yield* updateGuest(
          updated,
          judge(updated, created!),
          String(created!.digest),
        );
        const changed = yield* readLive(updated);
        expect(judge(updated, changed!).drift).toEqual([]);

        yield* runPve(
          nodes.putNodeLxcConfig({
            node: props.node,
            vmid: String(vmid),
            memory: "768",
            digest: String(changed!.digest),
          }),
        );
        const drifted = yield* readLive(updated);
        expect(judge(updated, drifted!).drift).toContain("memory");
        const refused = yield* destroyGuest(updated, updated).pipe(
          Effect.result,
        );
        expect(Result.isFailure(refused)).toBe(true);
        expect(yield* readLive(updated)).toBeDefined();

        // Restore the declaration before asking the guarded delete to remove the throwaway guest.
        yield* updateGuest(
          updated,
          judge(updated, drifted!),
          String(drifted!.digest),
        );
        yield* destroyGuest(updated, updated);
        expect(yield* readLive(updated)).toBeUndefined();
      }).pipe(
        Effect.provide(CredentialsFromEnv),
        Effect.provide(FetchHttpClient.layer),
      ),
    );
  },
  600_000,
);
