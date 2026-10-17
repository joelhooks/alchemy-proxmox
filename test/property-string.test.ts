import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { validateDiskSizes } from "../src/proxmox/qemu-size.ts";
import { parseProperty, propertyFormat } from "../src/proxmox/property-string.ts";
import { sameMap } from "../src/proxmox/lxc-wire.ts";
import { judge as judgeVm } from "../src/proxmox/qemu-judge.ts";
import { judge as judgeLxc } from "../src/proxmox/lxc-judge.ts";
import { judgeDisk, parseDisk } from "../src/proxmox/qemu-volume.ts";
import { parseVolume } from "../src/proxmox/lxc-volume.ts";
import { sameNet, netWrite } from "../src/proxmox/qemu-net.ts";

const equivalent = (
  guest: "qemu" | "lxc",
  key: string,
  want: string | boolean | number,
  have: string | boolean | number,
) => {
  const format = propertyFormat(guest, key);
  return sameMap(parseProperty(want, format), parseProperty(have, format));
};
// Public schema-shaped examples only. Identity placeholders are never used for API calls.
const identity = { node: "", vmid: 0 };

describe("schema-driven PVE property strings", () => {
  it.each([
    ["qemu", "agent", "enabled=1,enabled=1"],
    ["qemu", "agent", "enabled=1,enabled=0"],
    ["qemu", "agent", "1,enabled=1"],
    ["qemu", "agent", "freeze-fs=1,guest-fsfreeze=1"],
    ["qemu", "agent", "future-option=a,future-option=b"],
    ["qemu", "net0", "model=virtio,virtio=02:00:00:00:00:0a"],
    ["qemu", "net0", "virtio=02:00:00:00:00:0a,macaddr=02:00:00:00:00:0a"],
    ["qemu", "cpu", "host,cputype=host"],
    ["qemu", "scsi0", "storage:disk-image,volume=storage:disk-image"],
    ["lxc", "startup", "3,order=3"],
    ["lxc", "net0", "name=eth0,name=eth0"],
  ] as const)("rejects duplicate %s %s fields in %s", (guest, key, value) => {
    expect(() => parseProperty(value, propertyFormat(guest, key))).toThrow(
      "Duplicate property subkey",
    );
  });
  it("treats 1 and enabled=1 as the same agent property", () => {
    expect(equivalent("qemu", "agent", 1, "enabled=1")).toBe(true);
    expect(judgeVm({ ...identity, agent: 1 }, { agent: "enabled=1" }).drift).toEqual([]);
  });
  it.each([true, "1", "enabled=1", "enabled=1,"])("normalizes agent shorthand %j", (value) => {
    expect(equivalent("qemu", "agent", value, "enabled=1")).toBe(true);
  });
  it.each(["fstrim_cloned_disks=1", "type=isa", "freeze-fs-on-backup=0", "future-option=1"])(
    "retains differing agent subkeys: %s",
    (extra) => {
      expect(judgeVm({ ...identity, agent: 1 }, { agent: `enabled=1,${extra}` }).drift).toEqual([
        "agent",
      ]);
    },
  );
  it("compares explicit agent strings and documented aliases without dropping extra fields", () => {
    const want = "enabled=true,freeze-fs-on-backup=0,fstrim_cloned_disks=1,type=virtio";
    const have = "type=virtio,guest-fsfreeze=false,fstrim_cloned_disks=true,1,";
    expect(equivalent("qemu", "agent", want, have)).toBe(true);
    expect(judgeVm({ ...identity, agent: want }, { agent: have }).drift).toEqual([]);
    expect(equivalent("qemu", "agent", "enabled=0", "enabled=1")).toBe(false);
    for (const different of [
      "type=isa,guest-fsfreeze=false,fstrim_cloned_disks=true,1",
      "type=virtio,guest-fsfreeze=false,fstrim_cloned_disks=false,1",
      "type=virtio,guest-fsfreeze=true,fstrim_cloned_disks=true,1",
    ]) {
      expect(judgeVm({ ...identity, agent: want }, { agent: different }).drift).toEqual(["agent"]);
    }
  });
  it.each([
    ["memory", "768", "current=768,"],
    ["cpu", "host,hidden=1,flags=+aes", "flags=+aes,cputype=host,hidden=true"],
    ["boot", "cdn", "legacy=cdn,"],
    ["ipconfig0", "ip=dhcp,ip6=auto", "ip6=auto,ip=dhcp,"],
  ])("compares VM %s using its format", (key, want, have) => {
    expect(equivalent("qemu", key, want, have)).toBe(true);
    const props = { ...identity, [key]: key === "memory" ? 768 : want };
    expect(judgeVm(props, { [key]: have }).drift).toEqual([]);
  });
  it("does not turn boot order into a default key or reorder the device list", () => {
    expect(equivalent("qemu", "boot", "order=net1;ide0", "order=ide0;net1")).toBe(false);
    expect(equivalent("qemu", "boot", "order=net1;ide0", "net1;ide0")).toBe(false);
  });
  it("keeps serial ports as exact scalars, not property strings", () => {
    expect(propertyFormat("qemu", "serial0")).toBeUndefined();
    expect(
      judgeVm({ ...identity, serial0: "/dev/ttyS1" }, { serial0: "/dev/ttyS1" }).drift,
    ).toEqual([]);
    expect(
      judgeVm({ ...identity, serial0: "/dev/ttyS1" }, { serial0: "file=/dev/ttyS1" }).drift,
    ).toEqual(["serial0"]);
  });
  it("expands NIC model aliases and preserves the existing omitted-MAC policy", () => {
    const alias = "virtio=02:00:00:00:00:0a,bridge=testbridge,firewall=1";
    const explicit = "firewall=true,macaddr=02:00:00:00:00:0A,model=virtio,bridge=testbridge,";
    expect(equivalent("qemu", "net0", alias, explicit)).toBe(true);
    expect(sameNet(alias, explicit)).toBe(true);
    expect(sameNet("virtio,bridge=testbridge,firewall=1", explicit)).toBe(true);
    expect(sameNet("e1000,bridge=testbridge,firewall=1", explicit)).toBe(false);
    expect(sameNet(alias, explicit.replace("00:0A", "00:0B"))).toBe(false);
    expect(
      sameNet("e1000-82545em,bridge=testbridge", "model=e1000-82545em,bridge=testbridge"),
    ).toBe(true);
    expect(
      equivalent(
        "qemu",
        "net0",
        netWrite("virtio,bridge=otherbridge", explicit),
        "model=virtio,macaddr=02:00:00:00:00:0A,bridge=otherbridge",
      ),
    ).toBe(true);
  });
  it.each(["scsi0", "ide0"])(
    "normalizes %s file shorthand, aliases, order and option types",
    (key) => {
      const want = "storage:disk-image,size=12G,ssd=1,bps_rd_length=2";
      const have = "bps_rd_max_length=2,ssd=true,size=12G,volume=storage:disk-image,";
      expect(equivalent("qemu", key, want, have)).toBe(true);
      expect(judgeDisk(key, want, have)).toEqual({});
      expect(parseDisk("size=8M,media=cdrom,file=storage:seed-image,", key).volname).toBe(
        "seed-image",
      );
      expect(judgeDisk(key, want, have.replace("disk-image", "other-image")).refuse).toBeDefined();
      expect(judgeDisk(key, want, have.replace("12G", "6G")).refuse).toBeDefined();
      expect(
        parseDisk("file=storage:0,import-from=source:image,discard=on", key).options.has(
          "import-from",
        ),
      ).toBe(false);
      const refusal = Effect.runSync(
        Effect.flip(
          validateDiskSizes(
            { ...identity, [key]: "file=storage:4" },
            { ...identity, [key]: "volume=storage:8" },
          ),
        ),
      );
      expect(refusal.keys).toEqual([key]);
    },
  );
  it.each([
    ["features", "nesting=1,keyctl=0", "keyctl=false,nesting=true,"],
    ["rootfs", "storage:root-image,ro=1,size=6G", "size=6G,ro=true,volume=storage:root-image,"],
    [
      "mp0",
      "storage:data-image,mp=/data,backup=1",
      "backup=true,mp=/data,volume=storage:data-image,",
    ],
    ["net0", "name=eth1,ip=dhcp,firewall=1", "firewall=true,ip=dhcp,name=eth1,"],
    ["dev0", "/dev/zero,deny-write=1", "deny-write=true,path=/dev/zero,"],
    ["startup", "3,up=20,down=40", "down=40,order=03,up=20,"],
  ])("compares LXC %s using its format", (key, want, have) => {
    expect(equivalent("lxc", key, want, have)).toBe(true);
    expect(judgeLxc({ ...identity, [key]: want }, { [key]: have }).drift).toEqual([]);
  });
  it("reads LXC volume identity from its field, not the first comma component", () => {
    expect(parseVolume("ro=1,size=6G,volume=storage:root-image").volname).toBe("root-image");
    expect(
      judgeLxc(
        { ...identity, rootfs: "storage:root-image,size=6G" },
        { rootfs: "size=6G,volume=storage:other-image" },
      ).refuse.length,
    ).toBeGreaterThan(0);
  });
  it("normalizes typed decimal fields without treating blank or hexadecimal text as numbers", () => {
    expect(equivalent("qemu", "net0", "virtio,rate=1.00", "model=virtio,rate=1")).toBe(true);
    expect(equivalent("qemu", "net0", "virtio,rate= ", "virtio,rate=0")).toBe(false);
    expect(equivalent("qemu", "net0", "virtio,rate=0x10", "virtio,rate=16")).toBe(false);
  });
  it("does not erase unknown fields or fold case-sensitive strings", () => {
    expect(equivalent("qemu", "cpu", "host", "host,unknown=1")).toBe(false);
    expect(equivalent("qemu", "scsi0", "storage:Image", "file=storage:image")).toBe(false);
    expect(
      equivalent("lxc", "net0", "name=eth1,bridge=TestBridge", "name=eth1,bridge=testbridge"),
    ).toBe(false);
  });
});
