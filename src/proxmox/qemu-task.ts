// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-task.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as nodes from "@distilled.cloud/proxmox/nodes";
import type { ProxmoxOpContext } from "@distilled.cloud/proxmox/Protocol";
import * as Effect from "effect/Effect";
import { runPveWith } from "./distilled-pve.ts";
import { Credentials } from "@distilled.cloud/proxmox/Credentials";
import { QemuRefusedError } from "./qemu-errors.ts";
import type { VmProps } from "./qemu.ts";
import { text } from "./values.ts";
export const qemuTask = <E>(
  props: VmProps,
  operation: Effect.Effect<string, E, ProxmoxOpContext>,
  what: string,
  polls: number,
) =>
  Effect.gen(function* () {
    const credential = yield* yield* Credentials;
    const upid = text(yield* runPveWith(credential, operation));
    if (upid === "") {
      return yield* Effect.fail(
        new QemuRefusedError(
          `${what}: PVE returned no task id, so the write cannot be confirmed and is not claimed.`,
        ),
      );
    }
    let exit = "still running when this provider stopped waiting";
    for (let attempt = 0; attempt < polls; attempt++) {
      const status = yield* runPveWith(
        credential,
        nodes.getNodeTaskStatus({ node: props.node, upid }),
      ).pipe(Effect.orElseSucceed(() => undefined));
      if (status === undefined || status.status === undefined) {
        exit = "the task could not be read";
        break;
      }
      if (status.status === "stopped") {
        exit = text(status.exitstatus, "stopped with no exitstatus");
        break;
      }
      yield* Effect.sleep("1 second");
    }
    if (exit !== "OK") {
      return yield* Effect.fail(
        new QemuRefusedError(
          `${what}: task ${upid} ended "${exit}". Read the task log before running the deploy again.`,
        ),
      );
    }
  });
