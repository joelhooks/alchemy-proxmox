// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/ownership/resume.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Unowned } from "alchemy/AdoptPolicy";
import { Artifacts } from "alchemy/Artifacts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
// Alchemy's per-resource Artifacts carries the plan's ownership proof into apply.
const PROVEN = "homeflare/ownership/resumes";
const UNFINISHED = "homeflare/ownership/unfinished";
const note = (key: string, instanceId: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    const bag = yield* Effect.serviceOption(Artifacts);
    if (Option.isSome(bag)) yield* bag.value.set(key, instanceId);
  });
const noted = (key: string, instanceId: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const bag = yield* Effect.serviceOption(Artifacts);
    if (Option.isNone(bag)) return false;
    return (yield* bag.value.get<string>(key)) === instanceId;
  });
export const noteUnfinished = (instanceId: string): Effect.Effect<undefined> =>
  Effect.as(note(UNFINISHED, instanceId), undefined);
export const noteResume = <R>(
  instanceId: string,
  recovered: Effect.Effect<unknown, unknown, R>,
): Effect.Effect<void, never, R> =>
  Effect.gen(function* () {
    yield* noteUnfinished(instanceId);
    const unproven = () => Effect.succeed(undefined);
    const found = yield* recovered.pipe(
      Effect.catch(unproven),
      Effect.catchDefect(unproven),
    );
    if (found === undefined || found === null || Unowned.is(found)) return;
    yield* note(PROVEN, instanceId);
  });
export const resumes = (instanceId: string): Effect.Effect<boolean> =>
  noted(PROVEN, instanceId);
export const unfinished = (instanceId: string): Effect.Effect<boolean> =>
  noted(UNFINISHED, instanceId);
type Ask = {
  readonly id: string;
  readonly fqn: string;
  readonly instanceId: string;
  readonly olds: unknown;
  readonly output: unknown;
};
type Hook = Effect.Effect<unknown, unknown, unknown>;
interface Resumable {
  read?(input: Ask): Hook;
  diff?(input: Ask): Hook;
}
// A missing output is an unfinished generation, not permission to claim any matching guest.
export const provingResumes = <S extends Resumable>(service: S): S => {
  const { diff, read } = service;
  if (diff === undefined || read === undefined) return service;
  const proving: Resumable["diff"] = (input) =>
    Effect.gen(function* () {
      if (input.output === undefined) {
        yield* noteResume(
          input.instanceId,
          read({ ...input, output: undefined }),
        );
      }
      return yield* diff(input);
    });
  return { ...service, diff: proving } as S;
};
