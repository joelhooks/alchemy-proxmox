import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { parseProperty, propertyFormat } from "./property-string.ts";

export class PropertyStringInvalid extends Data.TaggedError("PropertyStringInvalid")<{
  readonly cause: unknown;
  readonly key: string;
}> {
  override get message() {
    return `Invalid property string in ${this.key}. Check for duplicate subkeys, including aliases and shorthand.`;
  }
}

export const validatePropertyStrings = Effect.fn(function* validatePropertyStringsEffect(
  guest: "qemu" | "lxc",
  props: Readonly<Record<string, unknown>>,
) {
  for (const [key, value] of Object.entries(props)) {
    const format = propertyFormat(guest, key);
    if (format === undefined || value === undefined) {
      continue;
    }
    yield* Effect.try({
      catch: (cause) => new PropertyStringInvalid({ cause, key }),
      try: () => {
        if (
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return parseProperty(value, format);
        }
        throw new Error("Expected a property string or scalar shorthand.");
      },
    });
  }
});
