// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-dns.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { isIP } from "node:net";
import { constraintsFor } from "./constraint-guard.ts";
const addressList = (value: string): boolean => {
  const values = value.includes("\0")
    ? value.split("\0")
    : value.replace(/[,;]/g, " ").trimStart().split(/\s+/);
  while (values.at(-1) === "") values.pop();
  const label = "[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?";
  const dns = new RegExp(`^(?:${label}\\.)*${label}(?![\\s\\S])`);
  return values.every(
    (value) => (isIP(value) !== 0 && !value.includes("%")) || dns.test(value),
  );
};
export const dnsRefusals = (nameserver: unknown): string[] => {
  if (nameserver === undefined) return [];
  const rule = constraintsFor("pve:PUT /nodes/{node}/qemu/{vmid}/config")[
    "nameserver"
  ];
  return rule?.format === "address-list" &&
    typeof nameserver === "string" &&
    addressList(nameserver)
    ? []
    : ["nameserver: must satisfy the vendor address-list format"];
};
