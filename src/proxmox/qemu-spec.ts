// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-spec.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
export { guardCreate, guardUpdate } from "./resource-guard.ts";
import { type VmAttributes, type VmProps, storedConfig } from "./qemu-props.ts";

export const attributesOf = (
  live: Record<string, unknown>,
  props: VmProps,
): VmAttributes => ({
  config: storedConfig(live),
  digest: String(live.digest),
  node: props.node,
  vmid: props.vmid,
});
