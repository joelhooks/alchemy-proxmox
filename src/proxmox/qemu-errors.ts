// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-errors.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
export class QemuRefusedError extends Error {
  readonly _tag = "QemuRefusedError";
  constructor(message: string) {
    super(message);
    this.name = "QemuRefusedError";
  }
}
