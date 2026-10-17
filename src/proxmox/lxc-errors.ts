// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-errors.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import * as Data from "effect/Data";

export class LxcRefusedError extends Data.TaggedError("LxcRefusedError")<{
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
export interface LxcWhere {
  readonly node: string;
  readonly vmid: number;
  readonly pool?: string;
}
