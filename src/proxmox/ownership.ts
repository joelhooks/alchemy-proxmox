import { createHash } from "node:crypto";
import { AdoptPolicy, OwnedBySomeoneElse } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export const ownershipTag = (fqn: string): string =>
  `alchemy-${createHash("sha256").update(fqn).digest("hex")}`;
export const hasTag = (fqn: string, tags: string | undefined): boolean =>
  (tags ?? "").split(";").includes(ownershipTag(fqn));
export const withTag = <P extends { tags?: string }>(props: P, fqn: string): P => ({
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
