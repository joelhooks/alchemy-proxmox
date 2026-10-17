# alchemy-proxmox

`Proxmox.Lxc` and `Proxmox.Vm` resources for Alchemy `2.0.0-beta.83` and Effect `4.0.5`, using the PVE HTTP API through `@distilled.cloud/proxmox`.

```ts
import * as Alchemy from "alchemy";
import * as Proxmox from "alchemy-proxmox";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "Guests",
  { providers: Proxmox.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const container = yield* Proxmox.Lxc("Container", {
      node: process.env.PROXMOX_NODE!,
      vmid: Number(process.env.PROXMOX_VMID),
      pool: process.env.PROXMOX_POOL,
      ostemplate: process.env.PROXMOX_TEMPLATE!,
      rootfs: `${process.env.PROXMOX_STORAGE}:4`,
      net0: `name=eth0,bridge=${process.env.PROXMOX_BRIDGE},ip=dhcp`,
      unprivileged: 1,
      memory: 512,
    });
    return { container };
  }),
);
```

## Credentials

Set `PROXMOX_URL`, `PROXMOX_TOKEN_ID` and `PROXMOX_TOKEN_SECRET`. The SDK normalizes the URL to the `/api2/json` API root. The URL includes any required port. Use a trusted certificate; this package does not disable TLS verification.

For explicit configuration, pass `Proxmox.Credentials.credentials({ baseUrl, tokenId, secret })` to `Proxmox.providers(...)`. `secret` accepts an Effect `Redacted` value. Credentials live in the provider layer, never in resource props or state.

The token needs the privileges required by the declared operations, including access to read guest configs and declared pool membership. A permission error is a failure, never evidence that a guest is absent.

## Guest rules

- Unowned guests require Alchemy's native `adopt(true)` or `--adopt` and an exact match for declared config keys. Adoption writes nothing, including tags. A mismatch names keys, not values.
- New guests receive an ownership tag derived from the resource FQN. Recorded output or that tag establishes ownership. `list()` discovers tagged guests; tagless adopted guests remain in state but do not appear in discovery. Omitted user tags stay unmanaged.
- Omitted config keys are unmanaged. Wire names follow PVE (`rootfs`, `mp0`, `scsi0`, `net0`, `ipconfig0`). The exported props describe the supported fields.
- Both resources retain by default. Opt in through Alchemy's removal policy to delete. Deletion refuses a guest that differs from its last declaration. It never stops a running guest or forces deletion.
- Neither resource plans replacement. Identity, template, node, storage and immutable config changes fail rather than replacing a guest. Move guests and volumes by hand.
- `pool` selects an existing pool at creation. Reads verify declared membership. This package does not create pools or move guests between them.
- LXC volume sizes can grow in place. VM `diskSizesGiB` gives minimum sizes for declared `scsi`/`ide` disks. Lowering a previous target fails; a larger live VM disk stays larger.
- Root-only writes are refused. Apply bind mounts, device passthrough and privileged LXC features on the node, then declare their live config if supported. Unsupported VM keys point to `qm set`.
- `start` applies only during creation. Power state is not managed.
- A missing managed guest fails planning and reconciliation with `MissingGuest`. Set `recreateIfMissing: true` to explicitly permit a fresh guest and new volumes. An adopted LXC without a template cannot be rebuilt.
- Writes are sent once. Each SDK call has a 30-second timeout and `Retry.none`. Create tasks allow 180 observations; delete and resize tasks allow 60, with a one-second pause between running observations. A lost answer is uncertainty, not permission to resend.

## Development

```sh
pnpm install
pnpm vendor:agent-sources
pnpm check
pnpm test
```

Offline tests cover config parsing and build the real Alchemy Node platform layer without credentials. The platform smoke test runs even when the PVE suite skips, so a missing Node platform peer fails locally. There are no mock servers. `pnpm check` runs Effect/TypeScript checking, oxfmt and type-aware oxlint with Ultracite core. The real lifecycle test skips loudly unless every target variable is present and `PROXMOX_LIVE=1` explicitly opts in:

- Credentials: `PROXMOX_URL`, `PROXMOX_TOKEN_ID`, `PROXMOX_TOKEN_SECRET`.
- Throwaway guest: `PROXMOX_NODE`, `PROXMOX_VMID`, `PROXMOX_POOL`, `PROXMOX_STORAGE`, `PROXMOX_TEMPLATE`, `PROXMOX_BRIDGE`.

The test refuses an occupied identity, creates a stopped unprivileged LXC with a 4 GiB root disk, reads it, changes memory, introduces hand drift, verifies deletion is refused, restores the declaration, deletes it and confirms absence. It then checks native adoption, mismatched adoption, a second-plan noop, tag discovery, unmanaged-tag preservation and missing-managed-guest refusal on the same identity. Adoption checks compare the complete config and the node's paginated task list filtered by VMID. The test token must be able to read that task list. Run only against an approved throwaway identity. A failed test can leave that guest for inspection; it does not force cleanup.

[PROVENANCE.md](./PROVENANCE.md) records the port and licenses. Source mirrors are reference-only and never ship with the package.
