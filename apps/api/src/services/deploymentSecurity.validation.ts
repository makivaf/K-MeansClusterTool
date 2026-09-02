import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allowedBrowserOrigins, isAllowedBrowserOrigin } from "../httpSecurity";
import { buildResearchEnvironment } from "./researchPipelineOrchestrator";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const serverSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "server.ts"), "utf8");
const appSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "app.ts"), "utf8");
const clusterSource = fs.readFileSync(path.join(repositoryRoot, "apps", "api", "src", "routes", "cluster.ts"), "utf8");

if (!serverSource.includes('"127.0.0.1"') || !serverSource.includes("API_HOST")) throw new Error("Local API is not loopback-bound by default");
if (!appSource.includes('app.disable("x-powered-by")') || !appSource.includes("Content-Security-Policy") || !appSource.includes('limit: "32kb"')) throw new Error("Production HTTP hardening is incomplete");
if (!clusterSource.includes("requireTrustedBrowserOrigin") || !clusterSource.includes("createFixedWindowRateLimiter") || !clusterSource.includes("synchronousRunActive")) throw new Error("Sensitive local routes lack origin, rate, or single-execution controls");
console.log("PASS deployment HTTP security: loopback default, restrictive headers/body limit, origin and rate controls");

if (allowedBrowserOrigins.size === 0 || isAllowedBrowserOrigin("https://malicious.example")) throw new Error("Browser origin policy is permissive");
console.log("PASS deployment browser boundary: untrusted origins are rejected");

const environment = buildResearchEnvironment({
  PATH: "trusted-path",
  SYSTEMROOT: "C:\\Windows",
  DATABASE_URL: "postgresql://secret",
  PRIVATE_API_KEY: "secret",
  RESEARCH_R_HOME: "C:\\R"
}, "win32");
if (environment.PATH?.includes("trusted-path") !== true || environment.R_HOME !== "C:\\R") throw new Error("Required research runtime environment was lost");
if (environment.DATABASE_URL || environment.PRIVATE_API_KEY || environment.RESEARCH_R_HOME) throw new Error("Deployment secrets escaped into the research subprocess environment");
console.log("PASS subprocess environment: required runtime values retained without database or unrelated secrets");
