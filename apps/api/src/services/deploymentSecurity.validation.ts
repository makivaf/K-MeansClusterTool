import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allowedBrowserOrigins, isAllowedBrowserOrigin } from "../httpSecurity";
import { buildResearchEnvironment } from "./researchPipelineOrchestrator";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const serverSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "server.ts"), "utf8");
const appSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "app.ts"), "utf8");
const clusterSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "routes", "cluster.ts"), "utf8");
const workspaceStoreSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "services", "localResearchWorkspaceStore.ts"), "utf8");
const webPackageSource = fs.readFileSync(path.join(repositoryRoot, "apps", "web", "package.json"), "utf8");

if (!serverSource.includes('process.env.API_HOST ?? "127.0.0.1"') || serverSource.includes('"0.0.0.0"')) throw new Error("API is not loopback-bound by default");
if (!serverSource.includes('process.env.NODE_ENV === "production" && !process.env.DATABASE_URL')) throw new Error("Production does not fail clearly when durable persistence is unconfigured");
if (!webPackageSource.includes("--host 127.0.0.1") || webPackageSource.includes("--host 0.0.0.0")) throw new Error("Vite development or preview is not loopback-bound");
if (!appSource.includes('app.disable("x-powered-by")') || !appSource.includes("Content-Security-Policy") || !appSource.includes('limit: "32kb"') || !appSource.includes('"Cache-Control", "no-store"')) throw new Error("Production HTTP hardening is incomplete");
if (!appSource.includes('process.env.ENABLE_HSTS === "true"') || !appSource.includes("Unhandled ${error instanceof Error ? error.name")) throw new Error("HTTPS opt-in or production error sanitization is incomplete");
if (!clusterSource.includes("requireTrustedBrowserOrigin") || !clusterSource.includes("createFixedWindowRateLimiter")) throw new Error("Sensitive local routes lack origin or rate controls");
if (clusterSource.includes('/api/cluster/run')) throw new Error("The legacy synchronous execution route bypasses the unified lifecycle admission control");
if (!clusterSource.includes("64 * 1024 * 1024") || !clusterSource.includes("Number.isSafeInteger") || !clusterSource.includes("files: 7") || !clusterSource.includes("fields: 0")) throw new Error("Multipart upload limits are incomplete or accept an invalid environment override");
if (!serverSource.includes("setInterval(cleanup") || !serverSource.includes("cleanupStaleResearchWorkspaces") || !workspaceStoreSource.includes("workspacePattern")) throw new Error("Sensitive temporary workspace cleanup is incomplete");
console.log("PASS deployment HTTP security: loopback defaults, restrictive headers/body limits, safe logs, and retention controls");

if (allowedBrowserOrigins.size === 0 || isAllowedBrowserOrigin("https://malicious.example")) throw new Error("Browser origin policy is permissive");
console.log("PASS deployment browser boundary: untrusted origins are rejected");

const environment = buildResearchEnvironment({
  PATH: "trusted-path",
  SYSTEMROOT: "C:\\Windows",
  LOCALAPPDATA: "C:\\Users\\User\\AppData\\Local",
  DATABASE_URL: "postgresql://secret",
  PRIVATE_API_KEY: "secret",
  RESEARCH_R_HOME: "C:\\R"
}, "win32");
if (environment.PATH?.includes("trusted-path") !== true || environment.R_HOME !== "C:\\R" || environment.LOCALAPPDATA !== "C:\\Users\\User\\AppData\\Local") throw new Error("Required research runtime environment was lost");
if (environment.DATABASE_URL || environment.PRIVATE_API_KEY || environment.RESEARCH_R_HOME) throw new Error("Deployment secrets escaped into the research subprocess environment");
console.log("PASS subprocess environment: required runtime values retained without database or unrelated secrets");
