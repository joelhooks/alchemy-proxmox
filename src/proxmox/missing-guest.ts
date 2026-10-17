import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

export class MissingGuest extends Data.TaggedError("MissingGuest")<{
  readonly node: string;
  readonly vmid: number;
  readonly keys: readonly string[];
  readonly reasons: readonly string[];
}> {
  override get message() {
    return this.reasons.join("\n");
  }
}
export const requireRecreation = Effect.fn(function* requireRecreationEffect(props: {
  node: string;
  vmid: number;
  recreateIfMissing?: boolean;
}) {
  if (props.recreateIfMissing === true) {
    return;
  }
  yield* Effect.fail(
    new MissingGuest({
      keys: ["recreateIfMissing"],
      node: props.node,
      reasons: [
        "The managed guest is missing. Refusing to create empty volumes; set recreateIfMissing: true explicitly to recreate it.",
      ],
      vmid: props.vmid,
    }),
  );
});
