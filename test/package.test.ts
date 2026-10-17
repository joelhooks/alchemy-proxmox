import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { expect, it } from "vitest";

it("imports built exports and constructs the README stacks in plain Node without credentials", async () => {
  const fixture = await readFile(new URL("consumer-stack.ts", import.meta.url), "utf-8");
  // Strip only the compile-checked fixture, never a package or dependency. The child
  // has no loader and disables implicit stripping, so source exports fail even locally.
  const program = `${stripTypeScriptTypes(fixture)}
import assert from "node:assert/strict";
import * as Layer from "effect/Layer";
import * as Credentials from "alchemy-proxmox/Credentials";
assert(import.meta.resolve("alchemy-proxmox").endsWith("/dist/index.js"));
assert(import.meta.resolve("alchemy-proxmox/Credentials").endsWith("/dist/credentials.js"));
assert(Layer.isLayer(Proxmox.providers()));
assert.equal(Credentials.credentials, Proxmox.Credentials.credentials);
console.log("Built package and consumer stacks constructed");
`;
  const stdout = execFileSync(
    process.execPath,
    ["--no-experimental-strip-types", "--input-type=module", "--eval", program],
    {
      cwd: new URL("../", import.meta.url),
      encoding: "utf-8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key !== "NODE_OPTIONS" && !key.startsWith("PROXMOX_"),
        ),
      ),
      timeout: 10_000,
    },
  );
  expect(stdout.trim()).toBe("Built package and consumer stacks constructed");
}, 15_000);
