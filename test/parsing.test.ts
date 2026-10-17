import { describe, expect, it } from "vitest";
import { parseVolume, sizeBytes } from "../src/proxmox/lxc-volume.ts";
import { netMaps, sameMap, scalarForm } from "../src/proxmox/lxc-wire.ts";
import { parseDisk } from "../src/proxmox/qemu-volume.ts";
import { diskBytes } from "../src/proxmox/qemu-size.ts";
import { storedConfig } from "../src/proxmox/lxc-props.ts";

describe("PVE config wire parsing", () => {
  it("reads allocation sizes and existing-volume options without losing volume identity", () => {
    expect(sizeBytes("1.5G")).toBe(1.5 * 1024 ** 3);
    expect(sizeBytes("not-a-size")).toBeUndefined();
    const fresh = parseVolume("storage:4,mp=/data,backup=1");
    expect(fresh.kind).toBe("new");
    expect(fresh.size).toBe(4 * 1024 ** 3);
    const existing = parseVolume("storage:volume,mp=/data,size=4G");
    expect(existing.kind).toBe("volume");
    expect(existing.volname).toBe("volume");
    expect(existing.options.get("mp")).toBe("/data");
    expect(existing.options.has("size")).toBe(false);
  });
  it("normalizes flags and unordered LXC network subproperties", () => {
    expect(scalarForm("onboot", "true")).toBe(scalarForm("onboot", "1"));
    const { want, have } = netMaps("name=eth0,ip=dhcp", "ip=dhcp,name=eth0");
    expect(sameMap(want, have)).toBe(true);
  });
  it("reads QEMU imports, options, and wire sizes", () => {
    expect(
      parseDisk("storage:0,import-from=source:image,discard=on").kind,
    ).toBe("fresh");
    expect(
      parseDisk("storage:volume,size=2G,discard=on").options.get("discard"),
    ).toBe("on");
    expect(diskBytes("storage:volume,size=2048M")).toBe(2 * 1024 ** 3);
    expect(diskBytes("storage:volume")).toBeUndefined();
  });
  it("stores only managed config fields and canonical scalar wire values", () => {
    expect(
      storedConfig({
        memory: 512,
        onboot: true,
        digest: "opaque",
        password: "excluded",
        lock: "create",
        future: "unknown",
      }),
    ).toEqual({ memory: "512", onboot: "1" });
  });
});
