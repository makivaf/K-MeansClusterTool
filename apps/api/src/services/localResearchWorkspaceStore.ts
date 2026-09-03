import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
export const researchWorkRoot = path.resolve(serviceDirectory, "../../work");
const workspacePattern = /^analysis-\d{13}-[a-f0-9]{12}$/;

export const cleanupStaleResearchWorkspaces = (maximumAgeMs: number): number => {
  fs.mkdirSync(researchWorkRoot, { recursive: true, mode: 0o700 });
  const cutoff = Date.now() - maximumAgeMs;
  let removed = 0;
  for (const entry of fs.readdirSync(researchWorkRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !workspacePattern.test(entry.name)) continue;
    const directory = path.resolve(researchWorkRoot, entry.name);
    if (!directory.startsWith(`${researchWorkRoot}${path.sep}`) || fs.statSync(directory).mtimeMs >= cutoff) continue;
    fs.rmSync(directory, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
};
