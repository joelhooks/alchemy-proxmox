// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-errors.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
export class LxcRefusedError extends Error {
  override readonly name = "LxcRefusedError";
}
export type LxcWhere = {
  readonly node: string;
  readonly pool?: string;
  readonly vmid: number;
};
