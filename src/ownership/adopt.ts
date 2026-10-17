// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/ownership/adopt.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { AdoptPolicy } from "alchemy/AdoptPolicy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { resumes, unfinished } from "./resume.ts";
import { forgetRefusedCreate, isCreate } from "./rows.ts";
export const adoptEnabled = (fqn: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const stack = yield* Effect.serviceOption(Stack);
    const scoped = Option.isSome(stack)
      ? stack.value.resources[fqn]?.Adopt
      : undefined;
    if (scoped !== undefined) return scoped;
    const policy = yield* Effect.serviceOption(AdoptPolicy);
    if (Option.isSome(policy)) return policy.value;
    const context = yield* Effect.serviceOption(AlchemyContext);
    return Option.isSome(context) ? context.value.adopt : false;
  });
export type Owner = {
  readonly fqn: string;
  readonly instanceId: string;
  readonly output: unknown;
};
const adoptable = (owner: Owner): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (yield* isCreate(owner.fqn, owner.instanceId)) return true;
    return yield* unfinished(owner.instanceId);
  });
// Re-check ownership when a guest appears between plan and apply, including deferred Outputs.
export const refuseTakeover = (
  owner: Owner,
  what: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (owner.output !== undefined) return;
    if (yield* resumes(owner.instanceId)) return;
    const may = yield* adoptable(owner);
    if (may && (yield* adoptEnabled(owner.fqn))) return;
    yield* forgetRefusedCreate(owner.fqn, owner.instanceId);
    const remedy = may
      ? "Deploy with --adopt (or wrap the resource in adopt(true)) to take it over, or remove it first."
      : "It is the new identity of a replace, which --adopt does not cover: remove it first.";
    return yield* Effect.die(
      new Error(
        `${what}: already exists, and this stack holds no state for it — the plan could not ask ` +
          "first (a prop was still an Output, a replace moved onto it, or it appeared after the " +
          `plan). Nothing was written. ${remedy}`,
      ),
    );
  });
