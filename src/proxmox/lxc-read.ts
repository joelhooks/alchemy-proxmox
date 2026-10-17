// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-read.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as cluster from "@distilled.cloud/proxmox/cluster";
import * as nodes from "@distilled.cloud/proxmox/nodes";
import * as Effect from "effect/Effect";
import { runPveWith } from "./distilled-pve.ts";
import { Credentials } from "@distilled.cloud/proxmox/Credentials";
import { LxcRefusedError } from "./lxc-errors.ts";
import type { LxcWhere } from "./lxc-errors.ts";
import { text } from "./values.ts";
import { checkPool } from "./pool.ts";

export const readLive = (where: LxcWhere) =>
  Effect.gen(function* readLiveEffect() {
    const credential = yield* yield* Credentials;
    const answer = yield* runPveWith(
      credential,
      nodes.getNodeLxcConfig({ node: where.node, vmid: String(where.vmid) }),
    ).pipe(
      Effect.map((data) => ({ data, error: undefined })),
      Effect.catchTag("LxcConfigNotFound", (error) => Effect.succeed({ data: undefined, error })),
    );
    if (answer.error === undefined) {
      const live: unknown = answer.data;
      if (
        live === null ||
        typeof live !== "object" ||
        Array.isArray(live) ||
        !("digest" in live) ||
        typeof live.digest !== "string" ||
        live.digest === ""
      ) {
        return yield* Effect.fail(
          new LxcRefusedError({
            keys: [],
            node: where.node,
            reasons: [
              `CT ${String(where.vmid)}: config read did not return a valid digest-bearing config.`,
            ],
            vmid: where.vmid,
          }),
        );
      }
      yield* checkPool(credential, where);
      const config: Record<string, unknown> = { ...live };
      return config;
    }
    const rows = yield* runPveWith(credential, cluster.listClusterResources({ type: "vm" }));
    if (
      !Array.isArray(rows) ||
      rows.some(
        (row) =>
          !Number.isSafeInteger(Number(row?.vmid)) ||
          Number(row?.vmid) <= 0 ||
          typeof row?.node !== "string" ||
          row.node === "" ||
          !["lxc", "qemu"].includes(row.type),
      )
    ) {
      yield* Effect.fail(
        new LxcRefusedError({
          keys: [],
          node: where.node,
          reasons: ["The cluster guest index did not identify its rows."],
          vmid: where.vmid,
        }),
      );
    }
    const found = rows.find((row) => Number(row.vmid) === where.vmid);
    if (found !== undefined && found.node === where.node && found.type === "lxc") {
      yield* Effect.fail(answer.error);
    }
    if (found !== undefined) {
      yield* Effect.fail(
        new LxcRefusedError({
          keys: [],
          node: where.node,
          reasons: [
            `vmid ${String(where.vmid)} is a ${text(found.type, "guest")} on ` +
              `${text(found.node, "?")}, not a container on ${where.node}. A migration is not an ` +
              "update and vmids are cluster-wide: declare the node it is on, or pick a free vmid.",
          ],
          vmid: where.vmid,
        }),
      );
    }

    // oxlint-disable-next-line unicorn/no-useless-undefined -- Alchemy optional read/diff results are explicitly undefined, not void.
    return undefined;
  });
