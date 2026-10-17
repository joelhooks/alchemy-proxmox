import * as pools from "@distilled.cloud/proxmox/pools";
import type { Config } from "@distilled.cloud/proxmox/Credentials";
import * as Effect from "effect/Effect";
import { runPveWith } from "./distilled-pve.ts";

/** Pool membership is create-only; checking it never moves a guest between pools. */
export const checkPool = (
  credential: Config,
  guest: { pool?: string; vmid: number; node: string },
) =>
  Effect.gen(function* () {
    if (guest.pool === undefined) return;
    const pool = yield* runPveWith(
      credential,
      pools.getPool({ poolid: guest.pool }),
    );
    if (
      !pool.members.some(
        (member) =>
          Number(member.vmid) === guest.vmid && member.node === guest.node,
      )
    ) {
      return yield* Effect.fail(
        new Error(
          "pool: the guest does not belong to the declared pool. Move it by hand before planning again.",
        ),
      );
    }
  });
