// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { Resource } from "alchemy";
import * as Provider from "alchemy/Provider";
import * as Effect from "effect/Effect";
import { provingResumes } from "../ownership/resume.ts";
import { qemuHandlers } from "./qemu-lifecycle.ts";
import type { PveRequirements } from "./resource.ts";
import type { VmAttributes, VmProps } from "./qemu-props.ts";
export type { VmAttributes, VmProps } from "./qemu-props.ts";
export interface Vm extends Resource<
  "Proxmox.Vm",
  VmProps,
  VmAttributes,
  never,
  PveRequirements
> {}
export const Vm = Resource<Vm>("Proxmox.Vm", {
  defaultRemovalPolicy: "retain",
});
export { createForm } from "./qemu-form.ts";
export const VmProvider = () =>
  Provider.effect(
    Vm,
    Effect.succeed(Vm.Provider.of(qemuHandlers)).pipe(
      Effect.map(provingResumes),
    ),
  );
