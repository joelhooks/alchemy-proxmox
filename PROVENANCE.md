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

Every ported file below retains its source-file attribution header. Paths on the right are relative to the published tarball's `src/` directory.

| Local files                                                                                                                                                                                                                                      | Source files                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `src/proxmox/lxc.ts`, `lxc-create-form.ts`, `lxc-errors.ts`, `lxc-identity.ts`, `lxc-judge.ts`, `lxc-lifecycle.ts`, `lxc-props.ts`, `lxc-read.ts`, `lxc-task.ts`, `lxc-volume.ts`, `lxc-wire.ts`                                                 | Same basenames under `proxmox/` |
| `src/proxmox/qemu.ts`, `qemu-dns.ts`, `qemu-errors.ts`, `qemu-form.ts`, `qemu-judge.ts`, `qemu-lifecycle.ts`, `qemu-net.ts`, `qemu-props.ts`, `qemu-read.ts`, `qemu-resize.ts`, `qemu-size.ts`, `qemu-spec.ts`, `qemu-task.ts`, `qemu-volume.ts` | Same basenames under `proxmox/` |
| `src/proxmox/values.ts`, `constraints.ts`, `constraint-guard.ts`, `resource-guard.ts`, `distilled-pve.ts`                                                                                                                                        | Same basenames under `proxmox/` |

The port removes comment banners, OpenBao minting, lease caching, cluster-member failover and unrelated resource kinds. `distilled-pve.ts` supplies one SDK credential with retries disabled and a bounded call. `resource-guard.ts` guards only VM forms. New provider collection, credential re-exports, pool membership checks, ownership tags, discovery and missing-guest errors connect the two ported resources.

### Native adoption and constraints

Alchemy beta.83 native adoption replaces all copied `src/ownership/*` helpers and `lxc-adoption.ts`. The port no longer reads State rows, Stack resource declarations, AlchemyContext or trace spans to prove ownership. `Provider.succeed` handlers return native `Unowned(attributes)` for an unrecorded, untagged guest. Recorded output or an FQN-derived ownership tag establishes ownership. Only creation stamps that tag; adoption never writes, even when explicitly enabled. Both resources refuse adoption unless the declared keys already match.

The copied generated constraint tables and their index were removed. They had no generator or no-diff gate in this repository. `constraint-guard.ts` now carries a deliberately partial, handwritten set of guards for the supported endpoint keys, adapted from the published homeflare guards. It checks only the listed integer bounds, required create/resize fields, resize slots, VM nameserver format and root-only VM writes. It is not a complete PVE schema. The SDK and server still validate the full request. Unused generic value helpers were also cut; retained helpers preserve their port attribution. Tag normalization now deduplicates after case-folding, covered by a parser assertion, so case variants do not manufacture tag drift.

### Measured behavior retained in live tests

`test/lifecycle.test.ts` names its Effect test `lifecycle; exact and mismatched adoption; second-plan noop; missing guest refusal`. It retains and extends these homeflare behaviors on one throwaway LXC:

- Original lifecycle: create, read, update, introduce hand drift, refuse deletion, repair, delete and confirm absence.
- Read-only exact adoption: `adopt: false` refuses an unowned guest; `adopt: true` succeeds without changing config or adding a node task.
- Mismatched adoption: `adopt: true` still refuses by differing key name, leaving config and the VMID-filtered node task list unchanged.
- Stable adoption: the second plan is a noop and adds no node tasks.
- Safe missing-guest handling: an out-of-band deletion produces typed `MissingGuest` rather than recreation without `recreateIfMissing`.
- Ownership metadata: discovery includes created tagged guests but omits tagless adopted guests; omitted user tags do not cause drift and survive a managed update.

Task assertions paginate the real node task list with `source: all` and a VMID filter. Config comparisons also catch synchronous writes that create no task. No mock API or fake lifecycle replaces this gate. The suite skips loudly unless all live inputs and `PROXMOX_LIVE=1` are set.

## Runtime dependency and Effect peer compatibility

`@distilled.cloud/proxmox` resolves to `@homeflare/distilled-proxmox` 0.3.5 (Apache-2.0), a typed Effect client generated from the PVE API schema. It is used as a dependency and not copied.

| Package                        | Version | Integrity                                                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| `@homeflare/distilled-proxmox` | 0.3.5   | `sha512-wcw8lLpwqHxD/FZJxq0HCHhL3uKYlUxvuEB3C9b232RgXZpAwkKY8sMQjV1mVgoT5XwN22qrz7bfhi102F61XA==` |

This package pins Effect `4.0.5` in both peer and development dependencies. The SDK publishes an exact `effect: 4.0.1` peer, so pnpm warns about `4.0.5`. That warning is accepted for this port. The pinned TypeScript `7.0.2` also exceeds `capnp-es` 0.0.16's declared `^5.7.3 || ^6.0.0` peer, pulled in through Alchemy's Cloudflare dependencies. The owner accepts both metadata warnings with green local gates. Neither peer is overridden or hidden. `pnpm peers check` therefore reports both mismatches and exits nonzero. Compatibility evidence is the install, typecheck, format/lint and test gates, plus the owner-run live gate below. A skipped live test is not live compatibility evidence.

### Gate evidence

- Local gates passed: `pnpm install`; `pnpm check` (Effect/TypeScript, oxfmt, type-aware oxlint); `PROXMOX_LIVE=0 pnpm test` (4 parser tests passed, 1 real-PVE test explicitly skipped).
- Follow-up live result: **pending owner run**. This worker does not have authorization to run the live PVE suite. Record the owner's result here after that run.

## Reference mirrors

`pnpm vendor:agent-sources` fetches these into `.agent_sources/`. They are gitignored and reference only, never runtime dependencies.

| Source                                   | Ref                                |
| ---------------------------------------- | ---------------------------------- |
| `alchemy-run/alchemy`                    | `v2.0.0-beta.83` (`db20b54e8`)     |
| `Effect-TS/effect`                       | `effect@4.0.5` (`7f524e25c`)       |
| `git.proxmox.com/pve-docs`               | `b423460` (bump version to 9.2.13) |
| `npm/@homeflare/alchemy@0.55.0`          | tarball, integrity above           |
| `npm/@homeflare/distilled-proxmox@0.3.5` | tarball, integrity above           |
