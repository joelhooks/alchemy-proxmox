// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-net.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { parseProperty, propertyFormat } from "./property-string.ts";
import { sameMap, printMap } from "./lxc-wire.ts";

const netProperties = (value: string) => parseProperty(value, propertyFormat("qemu", "net0"));
export const netMaps = (declared: string, live: string) => {
  const want = netProperties(declared);
  const have = netProperties(live);
  // Omitted MAC remains server-managed, regardless of model alias spelling.
  if ((want.get("macaddr") ?? "") === "") {
    want.delete("macaddr");
    have.delete("macaddr");
  }
  return { have, want };
};
export const sameNet = (declared: string, live: string): boolean => {
  const { have, want } = netMaps(declared, live);
  return sameMap(want, have);
};
export const netWrite = (declared: string, live: string): string => {
  const want = netProperties(declared);
  const mac = netProperties(live).get("macaddr");
  if ((want.get("macaddr") ?? "") === "" && mac !== undefined) {
    want.set("macaddr", mac);
  }
  return printMap(want, ["model", "macaddr"]);
};
