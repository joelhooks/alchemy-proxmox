import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { FieldKind, PropertyFormat } from "../src/proxmox/property-formats.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const record = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }
  throw new Error("Expected a record in pinned API data");
};
const array = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error("Expected an array in pinned API data");
};
const nodes = (entries: readonly unknown[]): Record<string, unknown>[] =>
  entries.flatMap((entry) => {
    const node = record(entry);
    return [node, ...nodes(node.children === undefined ? [] : array(node.children))];
  });
const stable = (value: unknown): unknown => {
  if (typeof value === "object" && value !== null) {
    const object = record(value);
    return Object.fromEntries(
      Object.keys(object)
        .toSorted()
        .map((key) => [key, stable(object[key])]),
    );
  }
  return value;
};
const named = new Set(["pve-qm-boot", "pve-vm-cpu-conf", "pve-qm-ipconfig", "pve-startup-order"]);
const namedKind = (token: string): FieldKind => {
  if (token === "<1|0>") {
    return "boolean";
  }
  return token === "<integer>" || token === "\\d+" ? "integer" : "string";
};
const namedFields = (definition: Record<string, unknown>): Record<string, unknown> => {
  const { format, typetext } = definition;
  if (typeof format !== "string" || !named.has(format) || typeof typetext !== "string") {
    throw new Error("Unsupported named property format");
  }
  const fields = Object.fromEntries(
    [...typetext.matchAll(/(?<key>[\w-]+)=(?:\])?(?<token><[^>]+>|\\d\+)/gu)].map((match) => {
      const key = match.groups?.key;
      const token = match.groups?.token;
      if (key === undefined || token === undefined) {
        throw new Error("Missing named property format capture");
      }
      return [
        key,
        {
          default_key: typetext.startsWith(`[[${key}=]`) ? 1 : 0,
          type: namedKind(token),
        },
      ];
    }),
  );
  if (Object.keys(fields).length === 0) {
    throw new Error("No fields extracted from named property format");
  }
  return fields;
};
const fieldKind = (field: Record<string, unknown>): FieldKind => {
  if (field.format === "mac-addr") {
    return "mac";
  }
  const { type } = field;
  return type === "boolean" || type === "integer" || type === "number" ? type : "string";
};
const compact = (value: unknown): PropertyFormat => {
  const definition = record(value);
  const format =
    typeof definition.format === "string" ? namedFields(definition) : record(definition.format);
  const fields: Record<string, FieldKind> = {};
  const aliases: Record<string, { readonly keyAlias?: string; readonly target: string }> = {};
  let defaultKey: string | undefined;
  for (const [key, raw] of Object.entries(format)) {
    const field = record(raw);
    if (field.default_key === 1) {
      defaultKey = key;
    }
    if (typeof field.alias === "string") {
      aliases[key] = {
        ...(typeof field.keyAlias === "string" ? { keyAlias: field.keyAlias } : {}),
        target: field.alias,
      };
    } else {
      fields[key] = fieldKind(field);
    }
  }
  return { aliases, ...(defaultKey === undefined ? {} : { defaultKey }), fields };
};

const root = new URL("../", import.meta.url);
const mirror = new URL(".agent_sources/git.proxmox.com/pve-docs/", root);
const revision = "b423460d22af888462b3d31dfff374abcfda95fa";
const actual = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: mirror,
  encoding: "utf-8",
}).trim();
if (actual !== revision) {
  throw new Error("PVE documentation mirror does not match the pinned revision");
}
execFileSync("git", ["diff", "--exit-code", revision, "--", "api-viewer/apidata.js"], {
  cwd: mirror,
});
const source = await readFile(new URL("api-viewer/apidata.js", mirror), "utf-8");
const schema: unknown = JSON.parse(source.slice(source.indexOf("["), source.lastIndexOf("]") + 1));
const all = nodes(array(schema));
const supported = {
  lxc: ["features", "rootfs", "mp[n]", "net[n]", "dev[n]", "startup"],
  qemu: ["agent", "boot", "cpu", "memory", "net[n]", "ide[n]", "scsi[n]", "ipconfig[n]"],
};
const formats = Object.fromEntries(
  Object.entries(supported).map(([kind, keys]) => {
    const endpoint = all.find((node) => node.path === `/nodes/{node}/${kind}/{vmid}/config`);
    const method = record(record(endpoint?.info).PUT);
    const parameters = record(method.parameters);
    const properties = record(parameters.properties);
    return [
      kind,
      Object.fromEntries(keys.toSorted().map((key) => [key, compact(properties[key])])),
    ];
  }),
);
const hash = createHash("sha256").update(source).digest("hex");
const output = `// Generated by scripts/generate-property-formats.ts. Do not edit by hand.
// PVE API metadata facts only; no descriptions or documentation prose copied.
// pve-docs ${revision}; api-viewer/apidata.js sha256 ${hash}.
export type FieldKind = "boolean" | "integer" | "number" | "mac" | "string";
export interface PropertyFormat {
  readonly defaultKey?: string;
  readonly fields: Readonly<Record<string, FieldKind>>;
  readonly aliases: Readonly<Record<string, { readonly target: string; readonly keyAlias?: string }>>;
}
export const PROPERTY_FORMATS: Readonly<Record<"qemu" | "lxc", Readonly<Record<string, PropertyFormat>>>> = ${JSON.stringify(stable(formats))};
`;
const formatted = execFileSync(
  fileURLToPath(new URL("node_modules/.bin/oxfmt", root)),
  ["--stdin-filepath", "src/proxmox/property-formats.ts"],
  { encoding: "utf-8", input: output },
);
const destination = new URL("src/proxmox/property-formats.ts", root);
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf-8")) !== formatted) {
    throw new Error("Property format metadata differs; run pnpm generate:property-formats");
  }
  console.log("Property format metadata matches pinned PVE API data");
} else {
  await writeFile(destination, formatted);
}
