import { createHash } from "node:crypto";
import { AdoptPolicy, OwnedBySomeoneElse } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Option from "effect/Option";

export class OwnershipTagStampFailed extends Data.TaggedError("OwnershipTagStampFailed")<{
  readonly node: string;
  readonly vmid: number;
  readonly cause: unknown;
}> {
  readonly keys = ["tags"] as const;
  readonly reasons = [
    "Guest creation completed, but ownership tags could not be confirmed. Inspect the guest and explicitly adopt if needed; nothing was deleted.",
  ] as const;
  override get message() {
    return `Guest ${String(this.vmid)}: ${this.reasons.join(" ")} After inspection, re-plan with adoption enabled (adopt: true or --adopt) for VMID ${String(this.vmid)}; declared config must match exactly.`;
  }
}

export const ownershipTag = (fqn: string): string =>
  `alchemy-${createHash("sha256").update(fqn).digest("hex")}`;
export const hasTag = (fqn: string, tags: string | undefined): boolean =>
  (tags ?? "").split(";").includes(ownershipTag(fqn));
export const withTag = <P extends { tags?: string }>(
  props: P,
  fqn: string,
): Omit<P, "tags"> & { tags: string } => ({
  ...props,
  tags: [...new Set([...(props.tags ?? "").split(";").filter(Boolean), ownershipTag(fqn)])]
    .toSorted()
    .join(";"),
});
export const requireOwnership = Effect.fn(function* requireOwnershipEffect(
  fqn: string,
  resourceType: string,
  owned: boolean,
) {
  if (owned) {
    return;
  }
  const policy = yield* Effect.serviceOption(AdoptPolicy);
  if (!Option.getOrElse(policy, () => false)) {
    yield* Effect.fail(
      new OwnedBySomeoneElse({
        logicalId: fqn,
        message:
          "Guest has no ownership tag and no recorded output. Enable adoption explicitly; nothing was written.",
        resourceType,
      }),
    );
  }
});
