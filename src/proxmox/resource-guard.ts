// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/resource-guard.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { guardForm } from "./constraint-guard.ts";
import { createForm, updateForm } from "./qemu-form.ts";
import type { VmProps } from "./qemu-props.ts";

export const guardCreate = (props: VmProps, presence: boolean) =>
  guardForm("pve:POST /nodes/{node}/qemu", createForm(props), presence);
export const guardUpdate = (props: VmProps) =>
  guardForm("pve:PUT /nodes/{node}/qemu/{vmid}/config", updateForm(props), false);
