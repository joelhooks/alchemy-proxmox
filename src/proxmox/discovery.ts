import * as cluster from "@distilled.cloud/proxmox/cluster";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { runPve } from "./distilled-pve.ts";

export class GuestDiscoveryFailed extends Data.TaggedError("GuestDiscoveryFailed")<{
  readonly node: string | undefined;
  readonly vmid: number | undefined;
  readonly keys: readonly string[];
  readonly reasons: readonly string[];
}> {
  override get message() {
    return this.reasons.join("\n");
  }
}

/** Native list is account-wide, not scoped to a particular resource FQN. */
export const taggedGuests = Effect.fn(function* taggedGuestsEffect(kind: "lxc" | "qemu") {
  const resources = yield* runPve(cluster.listClusterResources({ type: "vm" }));
  const guests: { node: string; vmid: number }[] = [];
  for (const row of resources) {
    if (
      row.type !== kind ||
      !(row.tags ?? "").split(";").some((tag) => /^alchemy-[\da-f]{64}$/u.test(tag))
    ) {
      continue;
    }
    if (row.node === undefined || row.vmid === undefined) {
      return yield* Effect.fail(
        new GuestDiscoveryFailed({
          keys: ["node", "vmid"],
          node: row.node,
          reasons: [
            "A tagged guest was listed without a complete identity; refusing incomplete discovery.",
          ],
          vmid: row.vmid,
        }),
      );
    }
    guests.push({ node: row.node, vmid: row.vmid });
  }
  return guests;
});
