# Provenance

## Ported source

`Proxmox.Lxc` and `Proxmox.Vm` are ported from the Proxmox provider in `@homeflare/alchemy` 0.55.0 (MIT, Timothy Schneider, `taslabs-net/homeflare-kit`, `packages/alchemy/src/proxmox/`). Its notice is kept in [`LICENSE-homeflare-kit`](./LICENSE-homeflare-kit). Each ported file says so in its header.

The homeflare-kit GitHub repository is no longer public, so the port is pinned to the published tarball, which ships `src/`:

| Package              | Version | Integrity                                                                                         |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `@homeflare/alchemy` | 0.55.0  | `sha512-UsO8HNQKanQRf71OnvMuCfG5rBx1XCRiAsnK2Y0DU3qbPK8jSOv8Pwu//h2RqHVmonSp/rUUe21kpKqU68U19Q==` |

This repository owns the ported code outright from 0.55.0. The homeflare-kit repository is gone, so upstream fixes cannot be pulled. The published tarball integrity hashes are the only link back to the port source.

The last homeflare-kit commit we hold a mirror of is `eb39d03` (2026-10-05), which predates 0.55.0. It is not the port source.

## File map

Every file below retains its source-file attribution header. Paths on the right are relative to the published tarball's `src/` directory.

| Local files                                                                                                                                                                                                                                      | Source files                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `src/proxmox/lxc.ts`, `lxc-adoption.ts`, `lxc-create-form.ts`, `lxc-errors.ts`, `lxc-identity.ts`, `lxc-judge.ts`, `lxc-lifecycle.ts`, `lxc-props.ts`, `lxc-read.ts`, `lxc-task.ts`, `lxc-volume.ts`, `lxc-wire.ts`                              | Same basenames under `proxmox/`                       |
| `src/proxmox/qemu.ts`, `qemu-dns.ts`, `qemu-errors.ts`, `qemu-form.ts`, `qemu-judge.ts`, `qemu-lifecycle.ts`, `qemu-net.ts`, `qemu-props.ts`, `qemu-read.ts`, `qemu-resize.ts`, `qemu-size.ts`, `qemu-spec.ts`, `qemu-task.ts`, `qemu-volume.ts` | Same basenames under `proxmox/`                       |
| `src/proxmox/values.ts`, `constraints.ts`, `constraint-guard.ts`, `resource-guard.ts`, `distilled-pve.ts`                                                                                                                                        | Same basenames under `proxmox/`                       |
| `src/proxmox/generated/constraints/pve-nodes-lxc.ts`, `pve-nodes-qemu.ts`                                                                                                                                                                        | Same basenames under `proxmox/generated/constraints/` |
| `src/ownership/adopt.ts`, `adopting.ts`, `probe.ts`, `resume.ts`, `rows.ts`, `whole.ts`                                                                                                                                                          | Same basenames under `ownership/`                     |

The port removes comment banners, OpenBao minting, lease caching, cluster-member failover and unrelated resource kinds. `distilled-pve.ts` now supplies one SDK credential with retries disabled and a bounded call. `resource-guard.ts` now guards only VM forms. New provider collection, credential re-exports, pool membership checks, shared types and the constraint-table index connect the two ported resources. VM adoption and deletion now use the same exact-match rules as LXC; node changes are refused for both resources.

## Runtime dependency

`@distilled.cloud/proxmox` resolves to `@homeflare/distilled-proxmox` 0.3.5 (Apache-2.0), a typed Effect client generated from the PVE API schema. It is used as a dependency and not copied.

| Package                        | Version | Integrity                                                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| `@homeflare/distilled-proxmox` | 0.3.5   | `sha512-wcw8lLpwqHxD/FZJxq0HCHhL3uKYlUxvuEB3C9b232RgXZpAwkKY8sMQjV1mVgoT5XwN22qrz7bfhi102F61XA==` |

## Reference mirrors

`pnpm vendor:agent-sources` fetches these into `.agent_sources/`. They are gitignored and reference only, never runtime dependencies.

| Source                                   | Ref                                |
| ---------------------------------------- | ---------------------------------- |
| `alchemy-run/alchemy`                    | `v2.0.0-beta.83` (`db20b54e8`)     |
| `Effect-TS/effect`                       | `effect@4.0.1` (`460272d30`)       |
| `git.proxmox.com/pve-docs`               | `b423460` (bump version to 9.2.13) |
| `npm/@homeflare/alchemy@0.55.0`          | tarball, integrity above           |
| `npm/@homeflare/distilled-proxmox@0.3.5` | tarball, integrity above           |
