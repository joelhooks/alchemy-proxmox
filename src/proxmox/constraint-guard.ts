// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/constraint-guard.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Effect from "effect/Effect";
import type { PveForm } from "./resource.ts";
import {
  type EndpointConstraints,
  type EndpointKey,
  refusal,
  violations,
} from "./constraints.ts";
import { PROXMOX_CONSTRAINTS } from "./generated/constraints/index.ts";
export { PROXMOX_CONSTRAINTS };
export const constraintsFor = (key: EndpointKey): EndpointConstraints => {
  const table = PROXMOX_CONSTRAINTS[key];
  if (table === undefined) {
    throw new Error(
      `no vendor constraint table for '${key}'. It is named in this package but not generated: ` +
        "check the pinned source tables in PROVENANCE.md.",
    );
  }
  return table;
};
export const formViolations = (
  key: EndpointKey,
  form: PveForm,
  presence: boolean,
): readonly string[] => violations(constraintsFor(key), form, { presence });
export const guardForm = (
  key: EndpointKey | undefined,
  form: PveForm,
  presence: boolean,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (key === undefined) return Effect.void;
    const found = formViolations(key, form, presence);
    return found.length === 0
      ? Effect.void
      : Effect.die(new Error(refusal(key, found)));
  });
