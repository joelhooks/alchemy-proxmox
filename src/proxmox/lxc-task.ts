// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-task.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as nodes from "@distilled.cloud/proxmox/nodes";
import type { ProxmoxOpContext } from "@distilled.cloud/proxmox/Protocol";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { runPveWith } from "./distilled-pve.ts";
import { LxcRefusedError } from "./lxc-errors.ts";
import type { LxcWhere } from "./lxc-errors.ts";
import { Credentials } from "@distilled.cloud/proxmox/Credentials";
import { text } from "./values.ts";

export const lxcTask = <E>(
  where: LxcWhere,
  operation: Effect.Effect<string, E, ProxmoxOpContext>,
  what: string,
  polls: number,
) =>
  Effect.gen(function* lxcTaskEffect() {
    const credential = yield* yield* Credentials;
    const upid = text(yield* runPveWith(credential, operation));
    if (upid === "") {
      yield* Effect.fail(
        new LxcRefusedError({
          keys: [],
          node: where.node,
          reasons: [
            `${what}: PVE returned no task id, so the write cannot be confirmed and is not claimed.`,
          ],
          vmid: where.vmid,
        }),
      );
    }
    let exit = "still running when this provider stopped waiting";
    for (let attempt = 0; attempt < polls; attempt += 1) {
      const status = yield* runPveWith(
        credential,
        nodes.getNodeTaskStatus({ node: where.node, upid }),
      ).pipe(Effect.option, Effect.map(Option.getOrUndefined));
      if (status === undefined || status.status === undefined) {
        exit =
          "the task could not be read -- the node stopped answering, or this lease cannot see it";
        break;
      }
      if (status.status === "stopped") {
        exit = text(status.exitstatus, "stopped with no exitstatus");
        break;
      }
      yield* Effect.sleep("1 second");
    }
    if (exit !== "OK") {
      yield* Effect.fail(
        new LxcRefusedError({
          keys: [],
          node: where.node,
          reasons: [
            `${what}: task ${upid} ended "${exit}". Read \`pvesh get /nodes/${where.node}/tasks/` +
              `${upid}/log\` before running the deploy again.`,
          ],
          vmid: where.vmid,
        }),
      );
    }
  });
