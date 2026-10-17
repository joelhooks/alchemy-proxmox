// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-errors.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Data from "effect/Data";

export class QemuRefusedError extends Data.TaggedError("QemuRefusedError")<{
  readonly vmid: number;
  readonly node: string;
  readonly keys: readonly string[];
  readonly reasons: readonly string[];
}> {
  override get message() {
    return [
      ...this.reasons,
      ...(this.keys.length === 0 ? [] : [`Keys: ${this.keys.join(", ")}`]),
    ].join("\n");
  }
}
