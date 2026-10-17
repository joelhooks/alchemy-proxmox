# Agent instructions

Proxmox VE resources for [Alchemy](https://alchemy.run), talking to the PVE HTTP API.

- Read `.agent_sources/` before claiming how Alchemy, Effect or the PVE API behaves. Populate it with `pnpm vendor:agent-sources`.
- The repo is public. It carries no hostnames, IPs, node names, storage ids, vmids or token ids. Live targets come from the environment.
- Ported code keeps its homeflare-kit attribution. See `PROVENANCE.md`.
- Creation omits all tags until the guest exists in its pool, then reads its digest, stamps user/ownership tags with a guarded config PUT and verifies them before returning output. A crash or stamp failure can leave an untagged guest with no recorded output. This is a known gap: inspect it, resolve any config mismatch and explicitly adopt if appropriate. Never infer ownership from an interrupted create or silently delete the guest. A completed ownership stamp can prove ownership even if output was not recorded.
- Native `list()` reads the cluster VM index, filters ownership tags client-side, then fetches complete configs. PVE's index has no server-side tag filter. Adoption deliberately writes no tag, so tagless adopted guests cannot be discovered this way; their recorded Alchemy output establishes ownership.
