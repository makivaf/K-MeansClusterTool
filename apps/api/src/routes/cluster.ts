// DUA compliance: uploaded CSV files may contain raw participant-level research data.
// These local-only routes are mounted only outside production, and raw CSVs stay on local disk only.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import express, { type Request } from "express";
import multer from "multer";
import {
  ClusterRunRequestSchema,
  ClusterRunResponseSchema,
  UploadResponseSchema
} from "../../../../packages/shared/src/schema";
import { AnalysisInputError, validateAnalysisInputManifest } from "../services/analysisInputManifest";

type UploadRequest = Request & {
  uploadBatchId?: string;
};

const routerDir = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(routerDir, "../../uploads");
const maxCsvBytes = 500 * 1024 * 1024;
const uploadRefPattern = /^upload-\d{13}-[a-f0-9]{12}$/;

const ensureUploadRoot = () => {
  fs.mkdirSync(uploadRoot, { recursive: true });
};

const getUploadDir = (uploadRef: string) => {
  if (!uploadRefPattern.test(uploadRef)) {
    throw new Error("Invalid upload reference");
  }

  const resolved = path.resolve(uploadRoot, uploadRef);
  if (!resolved.startsWith(uploadRoot)) {
    throw new Error("Invalid upload reference");
  }
  return resolved;
};

const sanitizeFilename = (filename: string) =>
  path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

const assignUploadBatch = (request: UploadRequest, _response: express.Response, next: express.NextFunction) => {
  ensureUploadRoot();
  request.uploadBatchId = `upload-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  fs.mkdirSync(getUploadDir(request.uploadBatchId), { recursive: true });
  next();
};

const storage = multer.diskStorage({
  destination: (request: UploadRequest, _file, callback) => {
    callback(null, getUploadDir(request.uploadBatchId ?? ""));
  },
  filename: (_request, file, callback) => {
    callback(null, sanitizeFilename(file.originalname));
  }
});

const csvUpload = multer({
  storage,
  limits: {
    fileSize: maxCsvBytes,
    files: 7
  },
  fileFilter: (_request, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== ".csv") {
      callback(new Error("Only .csv dataset files are accepted."));
      return;
    }
    callback(null, true);
  }
}).array("files");

export const clusterRouter = express.Router();

clusterRouter.post("/api/upload", assignUploadBatch, (request: UploadRequest, response, next) => {
  csvUpload(request, response, (error) => {
    if (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Unable to upload CSV files." });
      return;
    }
    next();
  });
});

clusterRouter.post("/api/upload", (request: UploadRequest, response) => {
  const files = Array.isArray(request.files) ? request.files : [];
  if (files.length === 0 || !request.uploadBatchId) {
    response.status(400).json({ error: "At least one .csv file is required." });
    return;
  }

  try {
    validateAnalysisInputManifest(getUploadDir(request.uploadBatchId));
  } catch (error) {
    fs.rmSync(getUploadDir(request.uploadBatchId), { recursive: true, force: true });
    const message = error instanceof AnalysisInputError ? error.message : "Unable to validate the analysis input manifest.";
    response.status(400).json({ error: message });
    return;
  }

  const payload = UploadResponseSchema.parse({ upload_ref: request.uploadBatchId, filenames: files.map((file) => file.originalname), file_count: files.length });

  response.status(201).json(payload);
});

clusterRouter.post("/api/cluster/run", async (request, response, next) => {
  try {
    const { upload_ref } = ClusterRunRequestSchema.parse(request.body);
    const uploadDir = getUploadDir(upload_ref);
    if (!fs.existsSync(uploadDir)) {
      response.status(404).json({ error: "Upload reference was not found on local disk." });
      return;
    }

    const runIds = await runLocalPipelinePlaceholder(upload_ref);
    response.json(ClusterRunResponseSchema.parse({ status: "complete", ...runIds }));
  } catch (error) {
    next(error);
  }
});

const runLocalPipelinePlaceholder = async (
  uploadReference: string
): Promise<{ axis_a_run_id: string; axis_b_run_id: string }> => {
  void uploadReference;
  await delay(1500);

  /*
   * TODO (later integration phases): replace this development fixture response
   * with a thin orchestrator that invokes separate Axis A and Axis B adapters,
   * validates two aggregate result records, imports each record independently,
   * and returns their distinct run IDs. Never persist raw participant rows.
   */
  return {
    axis_a_run_id: "dev-fixture-axis-a",
    axis_b_run_id: "dev-fixture-axis-b"
  };
};
