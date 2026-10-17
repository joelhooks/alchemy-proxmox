// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/distilled-pve.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Credentials } from "@distilled.cloud/proxmox/Credentials";
import type { Config } from "@distilled.cloud/proxmox/Credentials";
import type { ProxmoxOpContext } from "@distilled.cloud/proxmox/Protocol";
import * as Retry from "@distilled.cloud/proxmox/Retry";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

// A timed-out write may have landed. Disable the SDK's implicit retries, with no outer resend.
export const runPveWith = <A, E>(credential: Config, op: Effect.Effect<A, E, ProxmoxOpContext>) =>
  op.pipe(
    Retry.none,
    Effect.provide(Layer.succeed(Credentials, Effect.succeed(credential))),
    Effect.timeout("30 seconds"),
  );

export const runPve = <A, E>(op: Effect.Effect<A, E, ProxmoxOpContext>) =>
  Effect.gen(function* runPveEffect() {
    const credential = yield* yield* Credentials;
    return yield* runPveWith(credential, op);
  });
