// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/ownership/whole.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
const absent = (value: unknown): boolean =>
  value === undefined || value === null;
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
export const carries = (declared: unknown, recorded: unknown): boolean => {
  if (absent(declared)) return true;
  if (absent(recorded)) return false;
  if (Array.isArray(declared)) {
    if (!Array.isArray(recorded)) return false;
    return declared.every((each, index) => carries(each, recorded[index]));
  }
  if (isPlainObject(declared)) {
    if (!isPlainObject(recorded)) return false;
    return Object.entries(declared).every(([key, each]) =>
      carries(each, recorded[key]),
    );
  }
  return true;
};
export const wholeDeclaration = (
  fqn: string,
  props: unknown,
): Effect.Effect<boolean> =>
  Effect.map(Effect.serviceOption(Stack), (stack) => {
    const declared = Option.isSome(stack)
      ? stack.value.resources[fqn]
      : undefined;
    return declared !== undefined && carries(declared.Props, props);
  });
