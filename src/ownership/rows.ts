// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/ownership/rows.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Stack } from "alchemy/Stack";
import { State, type StateService, isActionState } from "alchemy/State/State";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { wholeDeclaration } from "./whole.ts";
type Where = {
  readonly stack: string;
  readonly stage: string;
};
const storeOf = Effect.gen(function* () {
  const stack = yield* Effect.serviceOption(Stack);
  const state = yield* Effect.serviceOption(State);
  if (Option.isNone(stack) || Option.isNone(state)) return undefined;
  const store: StateService = yield* state.value;
  const where: Where = { stack: stack.value.name, stage: stack.value.stage };
  return { resources: stack.value.resources, store, where };
});
const rowAt = (store: StateService, where: Where, fqn: string) =>
  store.get({ ...where, fqn }).pipe(Effect.orElseSucceed(() => undefined));
export type Generation = {
  readonly instanceId?: unknown;
  readonly status?: unknown;
  readonly props?: unknown;
  readonly attr?: unknown;
  readonly old?: unknown;
  readonly adopting?: unknown;
};
const generationOf = (
  row: unknown,
  instanceId: string,
): Generation | undefined => {
  let at = row;
  while (typeof at === "object" && at !== null && !isActionState(at as never)) {
    const generation = at as Generation;
    if (generation.instanceId === instanceId) return generation;
    at = generation.old;
  }
  return undefined;
};
export const recordedGeneration = (
  fqn: string,
  instanceId: string,
): Effect.Effect<Generation | undefined> =>
  Effect.gen(function* () {
    const found = yield* storeOf;
    if (found === undefined) return undefined;
    for (const at of [fqn, ...(found.resources[fqn]?.FormerFqns ?? [])]) {
      const generation = generationOf(
        yield* rowAt(found.store, found.where, at),
        instanceId,
      );
      if (generation !== undefined) return generation;
    }
    return undefined;
  });
export type Recorded = "absent" | "partial" | "whole";
export const recordedInstance = (
  fqn: string,
  instanceId: string,
): Effect.Effect<Recorded> =>
  Effect.gen(function* () {
    const generation = yield* recordedGeneration(fqn, instanceId);
    if (generation === undefined) return "absent";
    return (yield* wholeDeclaration(fqn, generation.props))
      ? "whole"
      : "partial";
  });
export const isCreate = (
  fqn: string,
  instanceId: string,
): Effect.Effect<boolean> =>
  Effect.map(
    recordedGeneration(fqn, instanceId),
    (generation) => generation?.status === "creating",
  );
// Otherwise a refused adoption's checkpoint could become false ownership evidence next time.
export const forgetRefusedCreate = (
  fqn: string,
  instanceId: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const found = yield* storeOf;
    if (found === undefined) return;
    const row = yield* rowAt(found.store, found.where, fqn);
    const mine = row as
      | {
          status?: unknown;
          instanceId?: unknown;
          attr?: unknown;
        }
      | undefined;
    if (
      mine?.status !== "creating" ||
      mine.instanceId !== instanceId ||
      mine.attr !== undefined
    ) {
      return;
    }
    yield* found.store.delete({ ...found.where, fqn }).pipe(Effect.ignore);
  });
