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

| Local files                                                                                                                                                                                                                                      | Source files                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `src/proxmox/lxc.ts`, `lxc-create-form.ts`, `lxc-errors.ts`, `lxc-identity.ts`, `lxc-judge.ts`, `lxc-lifecycle.ts`, `lxc-props.ts`, `lxc-read.ts`, `lxc-task.ts`, `lxc-volume.ts`, `lxc-wire.ts`                                                 | Same basenames under `proxmox/`                                      |
| `src/proxmox/qemu.ts`, `qemu-dns.ts`, `qemu-errors.ts`, `qemu-form.ts`, `qemu-judge.ts`, `qemu-lifecycle.ts`, `qemu-net.ts`, `qemu-props.ts`, `qemu-read.ts`, `qemu-resize.ts`, `qemu-size.ts`, `qemu-spec.ts`, `qemu-task.ts`, `qemu-volume.ts` | Same basenames under `proxmox/`                                      |
| `src/proxmox/values.ts`, `constraints.ts`, `constraint-guard.ts`, `resource-guard.ts`, `distilled-pve.ts`                                                                                                                                        | Same basenames under `proxmox/`                                      |
| `src/proxmox/property-string.ts`                                                                                                                                                                                                                 | Splitting adapted from `proxmox/lxc-wire.ts` and `proxmox/values.ts` |

The port removes comment banners, OpenBao minting, lease caching, cluster-member failover and unrelated resource kinds. `distilled-pve.ts` supplies one SDK credential with retries disabled and a bounded call. `resource-guard.ts` guards only VM forms. New provider collection, credential re-exports, pool membership checks, ownership tags, discovery and missing-guest errors connect the two ported resources.

### Native adoption and constraints

Alchemy beta.83 native adoption replaces all copied `src/ownership/*` helpers and `lxc-adoption.ts`. The port no longer reads State rows, Stack resource declarations, AlchemyContext or trace spans to prove ownership. `Provider.succeed` handlers return native `Unowned(attributes)` for an unrecorded, untagged guest. Recorded output or an FQN-derived ownership tag establishes ownership. Only creation stamps that tag; adoption never writes, even when explicitly enabled. Both resources refuse adoption unless the declared keys already match.

The copied generated constraint tables and their index were removed. They had no generator or no-diff gate in this repository. `constraint-guard.ts` now carries a deliberately partial, handwritten set of guards for the supported endpoint keys, adapted from the published homeflare guards. It checks only the listed integer bounds, required create/resize fields, resize slots, VM nameserver format and root-only VM writes. It is not a complete PVE schema. The SDK and server still validate the full request. Unused generic value helpers were also cut; retained helpers preserve their port attribution. Tag normalization now deduplicates after case-folding, covered by a parser assertion, so case variants do not manufacture tag drift.

### Property-string comparison

`src/proxmox/property-string.ts` supplies one pure parser for every supported property-string family. `scripts/generate-property-formats.ts` extracts only API metadata facts from pinned pve-docs `b423460d22af888462b3d31dfff374abcfda95fa`, `api-viewer/apidata.js`. The generated table records the source SHA-256. Inline formats supply `default_key`, `alias`, `keyAlias` and field types. Named formats expose their grammar through `typetext`; the script reads the default-subkey markers and typed fields there. No documentation descriptions are copied. This is comparison metadata, not a complete validation schema or a revival of the deleted constraint tables.

`pnpm generate:property-formats` regenerates the table. `pnpm check:property-formats` verifies the mirror revision and unmodified API file, regenerates in memory with the pinned formatter, and fails if the committed table differs. The normal check gate runs it. Builds and runtime imports use committed metadata and never read the mirror.

| Guest | Supported property keys checked | Default subkey / aliases                                       |
| ----- | ------------------------------- | -------------------------------------------------------------- |
| VM    | `agent`                         | `enabled`; filesystem-freeze aliases resolve to `freeze-fs`    |
| VM    | `memory`                        | `current`                                                      |
| VM    | `cpu`                           | `cputype`, from named-format grammar                           |
| VM    | `boot`                          | `legacy`, not `order`; the device list stays ordered           |
| VM    | `net[n]`                        | `model`; NIC model aliases expand to `model` plus `macaddr`    |
| VM    | `ide[n]`, `scsi[n]`             | `file`; `volume` and documented burst-length aliases normalize |
| VM    | `ipconfig[n]`                   | No default subkey                                              |
| LXC   | `features`, `net[n]`            | No default subkey                                              |
| LXC   | `rootfs`, `mp[n]`               | `volume`                                                       |
| LXC   | `dev[n]`                        | `path`                                                         |
| LXC   | `startup`                       | `order`, from named-format grammar                             |

The remaining declared config keys were checked too: VM `serial[n]` stays exact. VM name, scalar flags, cores, sockets, SCSI controller, resolver lists and tags have no property-string default-key grammar. Neither do LXC architecture, console mode, hostname, OS type, numeric settings, scalar flags, description, timezone, resolver lists and tags. Their existing scalar/list policies are unchanged. Creation controls and identity fields are not config property strings. No unsupported API families were added.

Parsed fields preserve extra and unknown subkeys and case-sensitive string values. Boolean and numeric fields normalize by their schema type; MAC addresses normalize case. There is no new default-value filling or removal. Existing LXC default elision and mount-option handling, generated-MAC handling, disk identity checks and resize policies remain separate policies after parsing. Disk source fields are now found by name, so field order and explicit default-key spelling do not change identity or bypass allocation-shrink checks.

VM `agent` now accepts `PveFlag | string`: flag shorthand cannot describe additional fields, so string declarations are needed to adopt or manage those fields without dropping them. The parser does not turn an extra agent subkey into an implicit default. Pure parsing/comparison tests use public schema-shaped examples, never private live identities or wire configurations. Live confirmation remains an owner gate.

### Post-create tagging and pool permissions

Creation now sends no tags in the guest POST. After the create task completes and pool membership exists, the provider reads the config digest, stamps desired user and ownership tags with a guarded config PUT, then verifies the tag set and ownership marker before returning output. `OwnershipTagStampFailed` names the VMID and retains the cause if this phase fails. It leaves the guest intact.

The source permission check explains this ordering: LXC's config permission checker delegates tags to `assert_tag_permissions`, which checks `VM.Config.Options` on the VM path without a prospective pool argument. QEMU also checks tags before adding pool membership. References: [pve-container](https://git.proxmox.com/?p=pve-container.git;a=blob;f=src/PVE/LXC.pm;hb=7cc33f73778067a4b0deaf4443d8b4b2273afe36), [GuestHelpers](https://git.proxmox.com/?p=pve-guest-common.git;a=blob;f=src/PVE/GuestHelpers.pm;hb=191c23e385e5dbed1938b2d1d322196831ef9331) and [QEMU create](https://git.proxmox.com/?p=qemu-server.git;a=blob;f=src/PVE/API2/Qemu.pm;hb=83b8f9cd3cdb9a3fbea87a7a4b81ffa90482e4c8). These public source revisions explain the observed failure; they are not a claim about the exact deployed revision. The fix does not request broader ACLs.

A crash or tag failure after creation can leave an untagged guest with no recorded output. `AGENTS.md` documents this known gap and the need for inspection and explicit adoption, not inferred ownership or automatic deletion. Adoption itself still never stamps tags.

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

- Local gates passed: `pnpm install`; `pnpm check` (Effect/TypeScript, oxfmt, type-aware oxlint); `PROXMOX_LIVE=0 pnpm test` (4 parser tests and 1 credential-free platform smoke test passed, 1 real-PVE test explicitly skipped).
- The owner's live attempt on `a2b46bd` stopped before any PVE call because Alchemy could not load its optional Node platform peer. The follow-up adds exact `@effect/platform-node` `4.0.5` as a development dependency and an unconditional `test/platform.test.ts` that resolves NodeServices/NodeSocket, then builds Alchemy's actual PlatformServices layer. Resolving the modules first makes a missing peer fail normally instead of reaching Alchemy's `process.exit` fallback.
- The owner's rerun on `cabeba7` passed the original lifecycle and every adoption case against real PVE. Managed creation then failed the tag permission check before starting a create task. The post-create tagging change above addresses that failure for LXC and VM; the test's existing pooled `operator-note` update is unchanged.
- Follow-up live result on `c97341e` (owner, 2026-10-17, PVE 9.2 with a pool-scoped privilege-separated token): `PROXMOX_LIVE=1 pnpm exec vitest run` passed 6 of 6 in 10.7 s. The node task list shows three create/destroy pairs for the throwaway VMID, all `OK` and none with warnings, and the guest is gone afterwards. That run covered the lifecycle, refused unowned and mismatched adoption with no task, exact adoption, a second-plan noop, tagged discovery, a managed create with a post-create tag stamp, unmanaged-tag preservation and missing-guest refusal.
- `pnpm peers check` on the same tree reports exactly the two accepted mismatches above: `effect` for the SDK and `typescript` for `capnp-es` 0.0.16.

## Reference mirrors

`pnpm vendor:agent-sources` fetches these into `.agent_sources/`. They are gitignored and reference only, never runtime dependencies.

| Source                                   | Ref                                |
| ---------------------------------------- | ---------------------------------- |
| `alchemy-run/alchemy`                    | `v2.0.0-beta.83` (`db20b54e8`)     |
| `Effect-TS/effect`                       | `effect@4.0.5` (`7f524e25c`)       |
| `git.proxmox.com/pve-docs`               | `b423460` (bump version to 9.2.13) |
| `npm/@homeflare/alchemy@0.55.0`          | tarball, integrity above           |
| `npm/@homeflare/distilled-proxmox@0.3.5` | tarball, integrity above           |
