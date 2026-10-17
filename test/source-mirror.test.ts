import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { requirePveMirror } from "../scripts/require-pve-mirror.ts";

it("explains how to populate a missing PVE documentation mirror", async () => {
  const missing = new URL(`../.git/missing-pve-docs-${randomUUID()}/`, import.meta.url);
  await expect(requirePveMirror(missing)).rejects.toThrow("Run pnpm vendor:agent-sources");
});
