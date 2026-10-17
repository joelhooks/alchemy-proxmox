// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-identity.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { isResolved } from "alchemy/Diff";
import type { LxcAttributes, LxcProps } from "./lxc-props.ts";

const field = (news: unknown, key: string): unknown => {
  if (typeof news !== "object" || news === null) {
    return undefined;
  }
  const fields: Record<string, unknown> = { ...news };
  return fields[key];
};
const plain = (news: unknown, key: string): string | number | undefined => {
  const value = field(news, key);
  return typeof value === "string" || typeof value === "number" ? value : undefined;
};
export const identityRefusals = (
  news: unknown,
  olds: LxcProps,
  output: LxcAttributes | undefined,
): { key: string; reason: string }[] => {
  const reasons: { key: string; reason: string }[] = [];
  const node = plain(news, "node");
  if (node !== undefined && node !== (output?.node ?? olds.node)) {
    reasons.push({
      key: "node",
      reason:
        "node: this resource never migrates a guest. Move it by hand and import it as a new resource.",
    });
  }
  if (isResolved(field(news, "pool")) && plain(news, "pool") !== olds.pool) {
    reasons.push({
      key: "pool",
      reason: "pool: moving a guest between pools is an operator action.",
    });
  }
  const vmid = plain(news, "vmid");
  if (vmid !== undefined && vmid !== (output?.vmid ?? olds.vmid)) {
    reasons.push({
      key: "vmid",
      reason:
        "vmid: this is a different guest. Declare it as a new resource; this one is retained when its declaration goes.",
    });
  }
  if (isResolved(field(news, "ostemplate")) && plain(news, "ostemplate") !== olds.ostemplate) {
    reasons.push({
      key: "ostemplate",
      reason: "ostemplate: a template is consumed at create; another one is a new guest.",
    });
  }
  return reasons;
};
