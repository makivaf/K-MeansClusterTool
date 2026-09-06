import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

const { app } = await import("./app");
const { cleanupStaleUploads } = await import("./services/localUploadStore");
const { cleanupStaleResearchWorkspaces } = await import("./services/localResearchWorkspaceStore");

const port = Number(process.env.PORT ?? 4000);
const host = process.env.API_HOST ?? "127.0.0.1";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  console.error("[api] Startup configuration error: DATABASE_URL is required when NODE_ENV=production.");
  process.exitCode = 1;
} else {
  if (process.env.NODE_ENV !== "production") {
    const configuredRetentionHours = Number(process.env.RESEARCH_UPLOAD_TTL_HOURS ?? 24);
    const retentionHours = Number.isFinite(configuredRetentionHours) && configuredRetentionHours > 0
      ? configuredRetentionHours
      : 24;
    const retentionMs = retentionHours * 60 * 60 * 1000;
    const cleanup = () => {
      try {
        cleanupStaleUploads(retentionMs);
        cleanupStaleResearchWorkspaces(retentionMs);
      } catch {
        console.warn("Temporary research-data cleanup did not complete.");
      }
    };
    cleanup();
    const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
    cleanupTimer.unref();
  }

  app.listen(port, host, () => {
    console.log(`AD clustering API listening on ${host}:${port}`);
  });
}
