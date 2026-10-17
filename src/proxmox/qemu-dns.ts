// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-dns.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { isIP } from "node:net";
import { constraintsFor } from "./constraint-guard.ts";

const addressList = (value: string): boolean => {
  const values = value.includes("\0")
    ? value.split("\0")
    : value.replaceAll(/[,;]/gu, " ").trimStart().split(/\s+/u);
  while (values.at(-1) === "") {
    values.pop();
  }
  const label = "[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?";
  const dns = new RegExp(`^(?:${label}\\.)*${label}(?![\\s\\S])`, "u");
  return values.every((entry) => (isIP(entry) !== 0 && !entry.includes("%")) || dns.test(entry));
};
export const dnsRefusals = (nameserver: unknown): string[] => {
  if (nameserver === undefined) {
    return [];
  }
  const rule = constraintsFor("pve:PUT /nodes/{node}/qemu/{vmid}/config").nameserver;
  return rule?.format === "address-list" &&
    typeof nameserver === "string" &&
    addressList(nameserver)
    ? []
    : ["nameserver: must satisfy the vendor address-list format"];
};
