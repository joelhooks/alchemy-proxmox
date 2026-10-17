import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { PropertyStringInvalid as PublicPropertyStringInvalid } from "alchemy-proxmox";
import {
  PropertyStringInvalid,
  validatePropertyStrings,
} from "../src/proxmox/property-validation.ts";
import { validateVm } from "../src/proxmox/qemu-lifecycle.ts";

const identity = { node: "", vmid: 0 };
const recoverPropertyKey = (error: PropertyStringInvalid) => Effect.succeed(error.key);

describe("typed property-string props validation", () => {
  it.each([
    ["qemu", "agent", "1,enabled=1"],
    ["qemu", "boot", "cdn,legacy=cdn"],
    ["qemu", "cpu", "host,cputype=host"],
    ["qemu", "memory", "768,current=768"],
    ["qemu", "net0", "model=virtio,virtio=02:00:00:00:00:0a"],
    ["qemu", "ide0", "storage:disk-image,volume=storage:disk-image"],
    ["qemu", "scsi0", "storage:disk-image,file=storage:disk-image"],
    ["qemu", "ipconfig0", "ip=dhcp,ip=dhcp"],
    ["lxc", "features", "keyctl=1,keyctl=1"],
    ["lxc", "rootfs", "storage:disk-image,volume=storage:disk-image"],
    ["lxc", "mp0", "storage:disk-image,volume=storage:disk-image"],
    ["lxc", "net0", "name=eth0,name=eth0"],
    ["lxc", "dev0", "/dev/example,path=/dev/example"],
    ["lxc", "startup", "3,order=3"],
  ] as const)("fails %s %s through the typed error channel", (guest, key, value) => {
    // flip handles checked failures only: a parser defect would still throw and fail this test.
    const error = Effect.runSync(Effect.flip(validatePropertyStrings(guest, { [key]: value })));
    expect(error).toBeInstanceOf(PropertyStringInvalid);
    expect(error).toMatchObject({ _tag: "PropertyStringInvalid", key });
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).not.toContain(value);
  });

  it("exports the tagged error through the built public package", () => {
    const error = new PublicPropertyStringInvalid({
      cause: new Error("Duplicate subkey"),
      key: "agent",
    });
    expect(error).toMatchObject({ _tag: "PropertyStringInvalid", key: "agent" });
  });

  it("supports catchTag recovery rather than defect recovery", () => {
    const recovered = Effect.runSync(
      validatePropertyStrings("lxc", { features: "keyctl=1,keyctl=1" }).pipe(
        Effect.catchTag("PropertyStringInvalid", recoverPropertyKey),
      ),
    );
    expect(recovered).toBe("features");
  });

  it("validates VM props before disk guards can encounter malformed strings", () => {
    const error = Effect.runSync(
      Effect.flip(validateVm({ ...identity, scsi0: "storage:8,file=storage:8" })),
    );
    expect(error).toMatchObject({ _tag: "PropertyStringInvalid", key: "scsi0" });
  });

  it("validates old VM disk props before allocation comparisons", () => {
    const error = Effect.runSync(
      Effect.flip(
        validateVm(
          { ...identity, scsi0: "storage:4" },
          { ...identity, scsi0: "storage:8,volume=storage:8" },
        ),
      ),
    );
    expect(error).toMatchObject({ _tag: "PropertyStringInvalid", key: "scsi0" });
  });

  it("leaves valid shorthand, empty and omitted values unchanged", () => {
    expect(() => {
      Effect.runSync(
        validatePropertyStrings("qemu", {
          agent: 1,
          cpu: "host,hidden=1",
          diskSizesGiB: { scsi0: 8 },
          ipconfig0: undefined,
          memory: 768,
          serial0: "literal=one,literal=two",
        }),
      );
      Effect.runSync(
        validatePropertyStrings("lxc", {
          features: "keyctl=1,nesting=1",
          net0: "name=eth0,ip=dhcp",
          startup: "",
        }),
      );
    }).not.toThrow();
  });
});
