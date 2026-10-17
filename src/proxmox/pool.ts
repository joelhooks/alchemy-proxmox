import * as pools from "@distilled.cloud/proxmox/pools";
import type { Config } from "@distilled.cloud/proxmox/Credentials";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { runPveWith } from "./distilled-pve.ts";

export class PoolMismatch extends Data.TaggedError("PoolMismatch")<{
  readonly node: string;
  readonly vmid: number;
  readonly keys: readonly string[];
  readonly reasons: readonly string[];
}> {
  override get message() {
    return this.reasons.join("\n");
  }
}

/** Pool membership is create-only; checking it never moves a guest between pools. */
export const checkPool = (
  credential: Config,
  guest: { pool?: string; vmid: number; node: string },
) =>
  Effect.gen(function* checkPoolEffect() {
    if (guest.pool === undefined) {
      return;
    }
    const pool = yield* runPveWith(credential, pools.getPool({ poolid: guest.pool }));
    if (
      !pool.members.some(
        (member) => Number(member.vmid) === guest.vmid && member.node === guest.node,
      )
    ) {
      yield* Effect.fail(
        new PoolMismatch({
          keys: ["pool"],
          node: guest.node,
          reasons: [
            "pool: the guest does not belong to the declared pool. Move it by hand before planning again.",
          ],
          vmid: guest.vmid,
        }),
      );
    }
  });
