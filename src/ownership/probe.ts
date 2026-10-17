// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/ownership/probe.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Unowned } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Tracer from "effect/Tracer";
import type { Owner } from "./adopt.ts";
import { resumes } from "./resume.ts";
import { forgetRefusedCreate, recordedInstance } from "./rows.ts";
// Apply checkpoints resolved props before reading; that row alone cannot prove ownership.
const inApplyResource = (span: Tracer.AnySpan | undefined): boolean => {
  let at = span;
  while (at !== undefined && at._tag === "Span") {
    if (at.name === "apply.resource") return true;
    at = Option.getOrUndefined(at.parent);
  }
  return false;
};
const isCreatesRead = (span: Option.Option<Tracer.Span>): boolean => {
  const current = Option.getOrUndefined(span);
  return current?.name === "provider.read" && inApplyResource(current);
};
const readsAtApply: Effect.Effect<boolean> = Effect.map(
  Effect.option(Effect.currentSpan),
  isCreatesRead,
);
// Only a whole recorded declaration and a matching live object can resume an interrupted create.
export const provenOurs = <E, R>(
  ask: {
    readonly fqn: string;
    readonly instanceId: string;
  },
  settled: Effect.Effect<boolean, E, R>,
): Effect.Effect<boolean, never, R> =>
  Effect.gen(function* () {
    if (yield* readsAtApply) return yield* resumes(ask.instanceId);
    const recorded = yield* recordedInstance(ask.fqn, ask.instanceId);
    if (recorded === "absent") return false;
    if (recorded === "partial") {
      yield* Effect.logWarning(
        `${ask.fqn}: the interrupted create's state row lacks part of the declaration (a prop ` +
          "was still an Output when it was written), so the live object is not proven ours",
      );
      return false;
    }
    const unproven = (reason: unknown) =>
      Effect.as(
        Effect.logWarning(
          `${ask.fqn}: the interrupted create's object could not be compared with its props ` +
            `(${reason instanceof Error ? reason.message : String(reason)}), so it is not treated as ours`,
        ),
        false,
      );
    return yield* settled.pipe(
      Effect.catch(unproven),
      Effect.catchDefect(unproven),
    );
  });
export const ownedRead = <A extends object, E, R>(
  ask: Owner,
  found: A | undefined,
  settled: Effect.Effect<boolean, E, R>,
): Effect.Effect<A | undefined, never, R> =>
  Effect.gen(function* () {
    if (found === undefined || ask.output !== undefined) return found;
    if (yield* provenOurs(ask, settled)) return found;
    if (yield* readsAtApply)
      yield* forgetRefusedCreate(ask.fqn, ask.instanceId);
    return Unowned(found);
  });
