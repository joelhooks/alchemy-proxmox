// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-lifecycle.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Effect from "effect/Effect";
import * as nodes from "@distilled.cloud/proxmox/nodes";
import { runPve } from "./distilled-pve.ts";
import { LxcRefusedError, type LxcWhere } from "./lxc-errors.ts";
import { readLive } from "./lxc-read.ts";
import { lxcTask } from "./lxc-task.ts";
import { guardForm } from "./constraint-guard.ts";
import type { EndpointKey } from "./constraints.ts";
import { createForm } from "./lxc-create-form.ts";
import { type LxcChange, judge } from "./lxc-judge.ts";
import type { LxcAttributes, LxcProps } from "./lxc-props.ts";
import { rawKeysOf, storedConfig } from "./lxc-props.ts";
import { text, withClears } from "./values.ts";
export { LxcRefusedError, type LxcWhere } from "./lxc-errors.ts";
export { readLive } from "./lxc-read.ts";
const LXC_ENDPOINTS = {
  create: "pve:POST /nodes/{node}/lxc" as EndpointKey,
  resize: "pve:PUT /nodes/{node}/lxc/{vmid}/resize" as EndpointKey,
  update: "pve:PUT /nodes/{node}/lxc/{vmid}/config" as EndpointKey,
};
const CREATE_POLLS = 180;
const TASK_POLLS = 60;
export const attributesOf = (
  where: LxcWhere,
  live: Record<string, unknown>,
): LxcAttributes => ({
  config: storedConfig(live),
  node: where.node,
  rawKeys: rawKeysOf(live),
  vmid: where.vmid,
});
export const createGuest = (props: LxcProps) =>
  Effect.gen(function* () {
    const form = createForm(props);
    yield* guardForm(LXC_ENDPOINTS.create, form, true);
    return yield* lxcTask(
      props,
      nodes.createNodeLxc({
        ...form,
        node: props.node,
        vmid: String(props.vmid),
        ostemplate: text(form["ostemplate"]),
      }),
      `create CT ${String(props.vmid)}`,
      CREATE_POLLS,
    );
  });
export const updateGuest = (
  props: LxcProps,
  change: LxcChange,
  digest: string,
) =>
  Effect.gen(function* () {
    if (Object.keys(change.put).length > 0 || change.clear.length > 0) {
      const form = withClears(
        { ...change.put, ...(digest === "" ? {} : { digest }) },
        change.clear,
      );
      yield* guardForm(LXC_ENDPOINTS.update, form, false);
      yield* runPve(
        nodes.putNodeLxcConfig({
          ...form,
          node: props.node,
          vmid: String(props.vmid),
        }),
      );
    }
    for (const grow of change.resize) {
      const grown = { disk: grow.disk, size: grow.size };
      yield* guardForm(LXC_ENDPOINTS.resize, grown, true);
      yield* lxcTask(
        props,
        nodes.putNodeLxcResize({
          ...grown,
          node: props.node,
          vmid: String(props.vmid),
        }),
        `grow ${grow.disk} of CT ${String(props.vmid)} to ${grow.size}`,
        TASK_POLLS,
      );
    }
  });
export const destroyGuest = (where: LxcWhere, declared: LxcProps) =>
  Effect.gen(function* () {
    const live = yield* readLive(where);
    if (live === undefined) return;
    const drift = judge(declared, live).drift;
    if (drift.length > 0) {
      return yield* Effect.fail(
        new LxcRefusedError(
          `destroy CT ${String(where.vmid)}: the guest on ${where.node} no longer matches its last ` +
            `declaration (${drift.join(", ")}), so it may not be the guest this stack made. ` +
            "Nothing was deleted. Delete it by hand if it should go, or declare it again.",
        ),
      );
    }
    yield* lxcTask(
      where,
      nodes.deleteNodeLxc({ node: where.node, vmid: String(where.vmid) }),
      `destroy CT ${String(where.vmid)}`,
      TASK_POLLS,
    );
  });
