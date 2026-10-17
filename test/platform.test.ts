import { it } from "@effect/vitest";
import { PlatformServices } from "alchemy/Util/PlatformServices";
import * as Effect from "effect/Effect";

it.effect("builds the Alchemy Node platform layer without credentials", () =>
  Effect.gen(function* platformSmoke() {
    // Fail normally before Alchemy's lazy loader can call process.exit for a missing peer.
    yield* Effect.promise(async () => await import("@effect/platform-node/NodeServices"));
    yield* Effect.promise(async () => await import("@effect/platform-node/NodeSocket"));
    yield* Effect.void.pipe(Effect.provide(PlatformServices));
  }),
);
