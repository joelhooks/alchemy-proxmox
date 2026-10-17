// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-adoption.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Effect from "effect/Effect";
import type { Owner } from "../ownership/adopt.ts";
import { adopting } from "../ownership/adopting.ts";
import { type LxcChange, judge } from "./lxc-judge.ts";
import { LxcRefusedError } from "./lxc-lifecycle.ts";
import type { LxcProps } from "./lxc-props.ts";
export const adoptionRefusal = (
  props: LxcProps,
  drift: readonly string[],
): string =>
  `CT ${String(props.vmid)} on ${props.node}: adopting it would change ${drift.join(", ")}. An ` +
  "adoption never changes a guest, so nothing is written. Declare what is live for these keys " +
  "(the plan names keys, never values) and plan again; change them after the adoption, as an " +
  "update.";
export const refuseAdoptedDrift = (
  owner: Owner,
  props: LxcProps,
  live: Record<string, unknown>,
  change: LxcChange,
): Effect.Effect<void, LxcRefusedError> =>
  Effect.gen(function* () {
    if (change.drift.length === 0) return;
    const settled = (recorded: unknown) =>
      Effect.sync(() => judge(recorded as LxcProps, live).drift.length === 0);
    if (!(yield* adopting(owner, settled))) return;
    return yield* Effect.fail(
      new LxcRefusedError(adoptionRefusal(props, change.drift)),
    );
  });
