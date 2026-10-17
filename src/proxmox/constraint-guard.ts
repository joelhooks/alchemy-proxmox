// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/constraint-guard.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import type { PveForm } from "./resource.ts";
import { violations } from "./constraints.ts";
import type { EndpointConstraints } from "./constraints.ts";

// Deliberately partial guards for supported keys, not a generated copy of the PVE schema.
const vmid = { maximum: 999_999_999, minimum: 100, required: true };
const lxc: EndpointConstraints = { cores: { maximum: 8192, minimum: 1 }, memory: { minimum: 16 } };
const qemu: EndpointConstraints = {
  cores: { minimum: 1 },
  nameserver: { format: "address-list" },
  sockets: { minimum: 1 },
};
const size = { pattern: "^\\+?\\d+(?:\\.\\d+)?[KMGT]?$", required: true };
const tables: Readonly<Record<string, EndpointConstraints>> = {
  "pve:POST /nodes/{node}/lxc": { ...lxc, ostemplate: { maxLength: 255, required: true }, vmid },
  "pve:POST /nodes/{node}/qemu": { ...qemu, vmid },
  "pve:PUT /nodes/{node}/lxc/{vmid}/config": lxc,
  "pve:PUT /nodes/{node}/lxc/{vmid}/resize": {
    disk: { enum: ["rootfs", ...Array.from({ length: 256 }, (_, n) => `mp${n}`)], required: true },
    size,
  },
  "pve:PUT /nodes/{node}/qemu/{vmid}/config": qemu,
  "pve:PUT /nodes/{node}/qemu/{vmid}/resize": {
    disk: {
      enum: [
        ...Array.from({ length: 4 }, (_, n) => `ide${n}`),
        ...Array.from({ length: 31 }, (_, n) => `scsi${n}`),
      ],
      required: true,
    },
    size,
  },
};
export const constraintsFor = (key: string): EndpointConstraints => {
  const table = tables[key];
  if (table === undefined) {
    throw new Error("No local guard for this endpoint.");
  }
  return table;
};
export const formViolations = (key: string, form: PveForm, presence: boolean): readonly string[] =>
  violations(constraintsFor(key), form, { presence });
export class InvalidGuestForm extends Data.TaggedError("InvalidGuestForm")<{
  readonly endpoint: string;
  readonly reasons: readonly string[];
}> {
  override get message() {
    return this.reasons.join("\n");
  }
}
export const guardForm = Effect.fn(function* guardFormEffect(
  key: string,
  form: PveForm,
  presence: boolean,
) {
  const reasons = formViolations(key, form, presence);
  if (reasons.length > 0) {
    yield* Effect.fail(new InvalidGuestForm({ endpoint: key, reasons }));
  }
});
