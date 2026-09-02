import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDirectory = path.dirname(fileURLToPath(import.meta.url));
export const uploadRoot = path.resolve(serviceDirectory, "../../uploads");
const uploadRefPattern = /^upload-\d{13}-[a-f0-9]{12}$/;

export class InvalidUploadReferenceError extends Error {}

export const ensureUploadRoot = (): void => {
  fs.mkdirSync(uploadRoot, { recursive: true, mode: 0o700 });
};

export const cleanupStaleUploads = (maximumAgeMs = Number(process.env.RESEARCH_UPLOAD_TTL_HOURS ?? 24) * 60 * 60 * 1000): number => {
  ensureUploadRoot();
  const cutoff = Date.now() - maximumAgeMs;
  let removed = 0;
  for (const entry of fs.readdirSync(uploadRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !uploadRefPattern.test(entry.name)) continue;
    const directory = resolveUploadDirectory(entry.name);
    if (fs.statSync(directory).mtimeMs >= cutoff) continue;
    removeUploadDirectory(directory);
    removed += 1;
  }
  return removed;
};

export const createUploadDirectory = (): { uploadRef: string; directory: string } => {
  ensureUploadRoot();
  const uploadRef = `upload-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const directory = resolveUploadDirectory(uploadRef);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return { uploadRef, directory };
};

export const resolveUploadDirectory = (uploadRef: string): string => {
  if (!uploadRefPattern.test(uploadRef)) throw new InvalidUploadReferenceError("Invalid upload reference.");
  const resolved = path.resolve(uploadRoot, uploadRef);
  if (!resolved.startsWith(`${uploadRoot}${path.sep}`)) throw new InvalidUploadReferenceError("Invalid upload reference.");
  return resolved;
};

export const removeUploadDirectory = (directory: string): void => {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new InvalidUploadReferenceError("Refusing to remove a directory outside the upload root.");
  }
  fs.rmSync(resolved, { recursive: true, force: true });
};
