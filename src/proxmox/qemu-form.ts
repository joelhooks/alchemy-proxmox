// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/qemu-form.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { declaredKeys, declaredValue, isManagedKey, wireValue } from "./qemu-props.ts";
import type { VmProps } from "./qemu-props.ts";
import { dnsRefusals } from "./qemu-dns.ts";

export const formRefusals = (props: VmProps): string[] => [
  ...declaredKeys(props)
    .filter((key) => !isManagedKey(key))
    .map(
      (key) =>
        `${key}: not a config key this resource manages. Use \`qm set <vmid> --${key} ...\` on the node instead.`,
    ),
  ...dnsRefusals(props.nameserver),
];
export const form = (props: VmProps): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const key of declaredKeys(props)) {
    if (!isManagedKey(key)) {
      continue;
    }
    out[key] = wireValue(declaredValue(props, key));
  }
  return out;
};
export const createForm = (props: VmProps) => ({
  ...form(props),
  vmid: String(props.vmid),
  ...(props.pool === undefined ? {} : { pool: props.pool }),
  ...(props.start === undefined ? {} : { start: wireValue(props.start) }),
});
export const updateForm = form;
