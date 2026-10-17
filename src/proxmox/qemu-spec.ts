// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-spec.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { storedConfig } from "./qemu-props.ts";
import type { VmAttributes, VmProps } from "./qemu-props.ts";

export { guardCreate, guardUpdate } from "./resource-guard.ts";

export const attributesOf = (live: Record<string, unknown>, props: VmProps): VmAttributes => ({
  config: storedConfig(live),
  digest: String(live.digest),
  node: props.node,
  vmid: props.vmid,
});
