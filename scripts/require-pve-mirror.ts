import { access } from "node:fs/promises";

export const requirePveMirror = async (mirror: URL): Promise<void> => {
  try {
    await access(new URL(".git", mirror));
    await access(new URL("api-viewer/apidata.js", mirror));
  } catch (error) {
    throw new Error(
      "PVE documentation mirror is missing or unreadable. Run pnpm vendor:agent-sources.",
      { cause: error },
    );
  }
};
