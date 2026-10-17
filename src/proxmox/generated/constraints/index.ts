import { PVE_NODES_LXC_CONSTRAINTS } from "./pve-nodes-lxc.ts";
import { PVE_NODES_QEMU_CONSTRAINTS } from "./pve-nodes-qemu.ts";

export const PROXMOX_CONSTRAINTS = {
  ...PVE_NODES_LXC_CONSTRAINTS,
  ...PVE_NODES_QEMU_CONSTRAINTS,
};
