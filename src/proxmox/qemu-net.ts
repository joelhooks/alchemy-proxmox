// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-net.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
const NIC_MODELS = [
  "e1000",
  "e1000e",
  "i82551",
  "i82557b",
  "i82559er",
  "i82562",
  "i82801",
  "ne2k_isa",
  "ne2k_pci",
  "pcnet",
  "rtl8139",
  "virtio",
  "vmxnet3",
] as const;
const netPairs = (value: string): Map<string, string> =>
  new Map(
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "")
      .map((part): [string, string] => {
        const at = part.indexOf("=");
        return at === -1 ? [part, ""] : [part.slice(0, at), part.slice(at + 1)];
      }),
  );
const modelKey = (map: ReadonlyMap<string, string>): string | undefined =>
  NIC_MODELS.find((model) => map.has(model));
export const netMaps = (declared: string, live: string) => {
  const want = netPairs(declared);
  const have = netPairs(live);
  const wantModel = modelKey(want);
  const haveModel = modelKey(have);
  if (
    wantModel !== undefined &&
    (want.get(wantModel) ?? "") === "" &&
    haveModel !== undefined
  ) {
    want.set(wantModel, have.get(haveModel) ?? "");
  }
  return { have, want };
};
export const sameNet = (declared: string, live: string): boolean => {
  const { have, want } = netMaps(declared, live);
  return (
    have.size === want.size && [...want].every(([k, v]) => have.get(k) === v)
  );
};
export const netWrite = (declared: string, live: string): string => {
  const want = netPairs(declared);
  const wantModel = modelKey(want);
  const have = netPairs(live);
  const haveModel = modelKey(have);
  if (
    wantModel !== undefined &&
    (want.get(wantModel) ?? "") === "" &&
    haveModel !== undefined
  ) {
    want.set(wantModel, have.get(haveModel) ?? "");
  }
  return [...want].map(([k, v]) => (v === "" ? k : `${k}=${v}`)).join(",");
};
