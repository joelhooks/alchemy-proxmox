// Compile-only consumer fixture; Vitest only discovers *.test.ts.
import * as Alchemy from "alchemy";
import * as Proxmox from "alchemy-proxmox";
import * as Effect from "effect/Effect";

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Set ${name}`);
  }
  return value;
};

export default Alchemy.Stack(
  "Guests",
  { providers: Proxmox.providers(), state: Alchemy.localState() },
  Effect.gen(function* guestStack() {
    const pool = process.env.PROXMOX_POOL;
    const container = yield* Proxmox.Lxc("Container", {
      memory: 512,
      net0: `name=eth0,bridge=${env("PROXMOX_BRIDGE")},ip=dhcp`,
      node: env("PROXMOX_NODE"),
      ostemplate: env("PROXMOX_TEMPLATE"),
      ...(pool === undefined ? {} : { pool }),
      rootfs: `${env("PROXMOX_STORAGE")}:4`,
      unprivileged: 1,
      vmid: Number(env("PROXMOX_VMID")),
    });
    return { container };
  }),
);

// Guard the VM resource's provider requirement as well as the README's LXC stack.
export const virtualMachineStack = Alchemy.Stack(
  "VirtualMachines",
  { providers: Proxmox.providers(), state: Alchemy.localState() },
  Effect.gen(function* virtualMachineProgram() {
    const pool = process.env.PROXMOX_POOL;
    const machine = yield* Proxmox.Vm("Machine", {
      memory: 512,
      node: env("PROXMOX_NODE"),
      ...(pool === undefined ? {} : { pool }),
      vmid: Number(env("PROXMOX_VMID")),
    });
    return { machine };
  }),
);
