// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-identity.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { isResolved } from "alchemy/Diff";
import type { LxcAttributes, LxcProps } from "./lxc-props.ts";
const plain = (news: unknown, key: string): unknown => {
  const value: unknown = (news as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number"
    ? value
    : undefined;
};
export const identityRefusals = (
  news: unknown,
  olds: LxcProps,
  output: LxcAttributes | undefined,
): string[] => {
  const was = output?.vmid ?? olds.vmid;
  const vmid = plain(news, "vmid");
  const template = plain(news, "ostemplate");
  const reasons: string[] = [];
  const node = plain(news, "node");
  if (node !== undefined && node !== (output?.node ?? olds.node)) {
    reasons.push(
      "node: this resource never migrates a guest. Move it by hand and import it as a new resource.",
    );
  }
  const pool = plain(news, "pool");
  if (
    isResolved((news as Record<string, unknown>).pool) &&
    pool !== olds.pool
  ) {
    reasons.push("pool: moving a guest between pools is an operator action.");
  }
  if (vmid !== undefined && vmid !== was) {
    reasons.push(
      `vmid: ${String(was)} -> ${String(vmid)} is a different guest. Declare it as a new ` +
        "resource; this one is retained when its declaration goes.",
    );
  }
  if (
    isResolved((news as Record<string, unknown>).ostemplate) &&
    template !== olds.ostemplate
  ) {
    reasons.push(
      "ostemplate: a template is consumed at create; another one is a new guest.",
    );
  }
  return reasons;
};
