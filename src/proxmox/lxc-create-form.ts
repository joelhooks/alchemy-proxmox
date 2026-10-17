// Ported from homeflare-kit (@homeflare/alchemy 0.55.0), src/proxmox/lxc-create-form.ts.
// MIT — Timothy Schneider. See LICENSE-homeflare-kit and PROVENANCE.md.
import { featureWhy, featuresNeedRoot, rootOnly } from "./lxc-judge.ts";
import { declaredKeys, declaredValue, indexedKey, isManagedKey, wireValue } from "./lxc-props.ts";
import type { LxcProps } from "./lxc-props.ts";
import { isHostPath, parseVolume } from "./lxc-volume.ts";
import { scalarForm } from "./lxc-wire.ts";
import { bool } from "./values.ts";

const existingVolume = (key: string, value: string) =>
  `${key}: ${value} names an existing volume, and PVE would unpack the template onto it. A ` +
  "create allocates new volumes only: declare `storage:GiB`, and attach an existing volume by " +
  "hand after the create.";
export const createRefusals = (props: LxcProps): string[] => {
  const refuse: string[] = [];
  if (props.ostemplate === undefined || props.ostemplate === "") {
    refuse.push(
      `CT ${String(props.vmid)} does not exist on ${props.node}, and without \`ostemplate\` ` +
        "there is nothing to create it from. To adopt a guest, declare the node it is on.",
    );
  }
  const unprivileged = props.unprivileged === undefined ? true : bool(props.unprivileged);
  for (const key of declaredKeys(props)) {
    const value = wireValue(declaredValue(props, key));
    const family = indexedKey(key)?.[0];
    if (!isManagedKey(key)) {
      refuse.push(`${key}: not a config key this resource manages.`);
    }
    if (value === "") {
      continue;
    }
    if (family === "dev") {
      refuse.push(rootOnly(props.vmid, key, value, "Device passthrough."));
    }
    const volume = family === "mp" || key === "rootfs" ? parseVolume(value) : undefined;
    if (volume !== undefined && isHostPath(volume)) {
      refuse.push(rootOnly(props.vmid, key, value, "A bind or device mount point."));
    }
    if (volume?.kind === "volume") {
      refuse.push(existingVolume(key, value));
    }
    if (key === "features" && featuresNeedRoot("", value, unprivileged)) {
      refuse.push(rootOnly(props.vmid, key, value, featureWhy(unprivileged)));
    }
  }
  return refuse;
};
export const createForm = (props: LxcProps): Record<string, string> => {
  const form: Record<string, string> = { vmid: String(props.vmid) };
  if (props.ostemplate !== undefined) {
    form.ostemplate = props.ostemplate;
  }
  if (props.pool !== undefined) {
    form.pool = props.pool;
  }
  if (props.start !== undefined) {
    form.start = wireValue(props.start);
  }
  for (const key of declaredKeys(props)) {
    const value = wireValue(declaredValue(props, key));
    if (value === "") {
      continue;
    }
    form[key] = key === "features" ? scalarForm(key, value) : value;
  }
  return form;
};
