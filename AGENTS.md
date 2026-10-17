# Agent instructions

Proxmox VE resources for [Alchemy](https://alchemy.run), talking to the PVE HTTP API.

- Read `.agent_sources/` before claiming how Alchemy, Effect or the PVE API behaves. Populate it with `pnpm vendor:agent-sources`.
- The repo is public. It carries no hostnames, IPs, node names, storage ids, vmids or token ids. Live targets come from the environment.
- Ported code keeps its homeflare-kit attribution. See `PROVENANCE.md`.
- Native `list()` reads the cluster VM index, filters ownership tags client-side, then fetches complete configs. PVE's index has no server-side tag filter. Adoption deliberately writes no tag, so tagless adopted guests cannot be discovered this way; their recorded Alchemy output establishes ownership.
