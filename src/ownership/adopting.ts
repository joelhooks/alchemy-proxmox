// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/ownership/adopting.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Effect from "effect/Effect";
import type { Owner } from "./adopt.ts";
import { provenOurs } from "./probe.ts";
import { recordedGeneration } from "./rows.ts";
export const adopting = <E, R>(
  owner: Owner,
  settled: (recorded: unknown) => Effect.Effect<boolean, E, R>,
): Effect.Effect<boolean, never, R> =>
  Effect.gen(function* () {
    if (owner.output === undefined) return false;
    const generation = yield* recordedGeneration(owner.fqn, owner.instanceId);
    if (generation === undefined || generation.adopting === true) return true;
    if (generation.attr !== undefined && generation.attr !== null) return false;
    return !(yield* provenOurs(owner, settled(generation.props)));
  });
