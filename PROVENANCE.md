# Provenance

## Ported source

`Proxmox.Lxc` and `Proxmox.Vm` are ported from the Proxmox provider in `@homeflare/alchemy` 0.55.0 (MIT, Timothy Schneider, `taslabs-net/homeflare-kit`, `packages/alchemy/src/proxmox/`). Its notice is kept in [`LICENSE-homeflare-kit`](./LICENSE-homeflare-kit). Each ported file says so in its header.

The homeflare-kit GitHub repository is no longer public, so the port is pinned to the published tarball, which ships `src/`:

| Package | Version | Integrity |
| --- | --- | --- |
| `@homeflare/alchemy` | 0.55.0 | `sha512-UsO8HNQKanQRf71OnvMuCfG5rBx1XCRiAsnK2Y0DU3qbPK8jSOv8Pwu//h2RqHVmonSp/rUUe21kpKqU68U19Q==` |

The last homeflare-kit commit we hold a mirror of is `eb39d03` (2026-10-05), which predates 0.55.0. It is not the port source.

## Runtime dependency

`@distilled.cloud/proxmox` resolves to `@homeflare/distilled-proxmox` 0.3.5 (Apache-2.0), a typed Effect client generated from the PVE API schema. It is used as a dependency and not copied.

| Package | Version | Integrity |
| --- | --- | --- |
| `@homeflare/distilled-proxmox` | 0.3.5 | `sha512-wcw8lLpwqHxD/FZJxq0HCHhL3uKYlUxvuEB3C9b232RgXZpAwkKY8sMQjV1mVgoT5XwN22qrz7bfhi102F61XA==` |

## Reference mirrors

`pnpm vendor:agent-sources` fetches these into `.agent_sources/`. They are gitignored and reference only, never runtime dependencies.

| Source | Ref |
| --- | --- |
| `alchemy-run/alchemy` | `v2.0.0-beta.83` (`db20b54e8`) |
| `Effect-TS/effect` | `effect@4.0.1` (`460272d30`) |
| `git.proxmox.com/pve-docs` | `b423460` (bump version to 9.2.13) |
| `npm/@homeflare/alchemy@0.55.0` | tarball, integrity above |
| `npm/@homeflare/distilled-proxmox@0.3.5` | tarball, integrity above |
