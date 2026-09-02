// DUA compliance: uploaded CSV files may contain raw participant-level research data.
// These local-only routes are mounted only outside production, and raw CSVs stay on local disk only.
import fs from "node:fs";
import path from "node:path";
import express, { type Request } from "express";
import multer from "multer";
import {
  ClusterRunRequestSchema,
  ClusterRunResponseSchema,
  UploadResponseSchema
} from "../../../../packages/shared/src/schema";
import { AnalysisInputError, validateAnalysisInputManifest } from "../services/analysisInputManifest";
import { ArtifactValidationError } from "../services/artifactReaders";
import { executeAnalysis } from "../services/executeAnalysis";
import {
  createUploadDirectory,
  removeUploadDirectory,
  resolveUploadDirectory
} from "../services/localUploadStore";
import { ResearchExecutionError } from "../services/researchPipelineOrchestrator";
import { ZodError } from "zod";
import { createFixedWindowRateLimiter, requireTrustedBrowserOrigin } from "../httpSecurity";

type UploadRequest = Request & {
  uploadBatchId?: string;
};

const maxCsvBytes = Number(process.env.RESEARCH_MAX_CSV_BYTES ?? 500 * 1024 * 1024);
const maxUploadRequestBytes = (maxCsvBytes * 7) + (1024 * 1024);

const sanitizeFilename = (filename: string) =>
  path
    .basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

const assignUploadBatch = (request: UploadRequest, _response: express.Response, next: express.NextFunction) => {
  request.uploadBatchId = createUploadDirectory().uploadRef;
  next();
};

const storage = multer.diskStorage({
  destination: (request: UploadRequest, _file, callback) => {
    callback(null, resolveUploadDirectory(request.uploadBatchId ?? ""));
  },
  filename: (_request, file, callback) => {
    const sanitized = sanitizeFilename(file.originalname);
    if (sanitized.length === 0 || sanitized.length > 180) {
      callback(new Error("A dataset filename is invalid."), "");
      return;
    }
    callback(null, sanitized);
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
let synchronousRunActive = false;

clusterRouter.use(requireTrustedBrowserOrigin);
clusterRouter.use(createFixedWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  maximumRequests: 4,
  message: "Too many local research requests. Try again later."
}));

clusterRouter.use((request, response, next) => {
  const contentLength = Number(request.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxUploadRequestBytes) {
    response.status(413).json({ error: "The upload request exceeds the configured size limit." });
    return;
  }
  next();
});

clusterRouter.post("/api/upload", assignUploadBatch, (request: UploadRequest, response, next) => {
  csvUpload(request, response, (error) => {
    if (error) {
      if (request.uploadBatchId) {
        try { removeUploadDirectory(resolveUploadDirectory(request.uploadBatchId)); } catch { /* best-effort cleanup */ }
      }
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
        ? "A CSV file exceeds the configured size limit."
        : error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT"
          ? "Exactly seven CSV files are allowed."
          : error instanceof Error && ["Only .csv dataset files are accepted.", "A dataset filename is invalid."].includes(error.message)
            ? error.message
            : "Unable to store the uploaded CSV files.";
      response.status(400).json({ error: message });
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
    validateAnalysisInputManifest(resolveUploadDirectory(request.uploadBatchId));
  } catch (error) {
    removeUploadDirectory(resolveUploadDirectory(request.uploadBatchId));
    const message = error instanceof AnalysisInputError ? error.message : "Unable to validate the analysis input manifest.";
    response.status(400).json({ error: message });
    return;
  }

  const payload = UploadResponseSchema.parse({ upload_ref: request.uploadBatchId, filenames: files.map((file) => file.originalname), file_count: files.length });

  response.status(201).json(payload);
});

clusterRouter.post("/api/cluster/run", (request, response, next) => {
  if (synchronousRunActive) {
    response.status(429).json({ error: "A local research analysis is already running." });
    return;
  }
  synchronousRunActive = true;
  next();
}, async (request, response, next) => {
  try {
    const { upload_ref, run_label } = ClusterRunRequestSchema.parse(request.body);
    const uploadDir = resolveUploadDirectory(upload_ref);
    if (!fs.existsSync(uploadDir)) {
      response.status(404).json({ error: "Upload reference was not found on local disk." });
      return;
    }

    try {
      const result = await executeAnalysis(uploadDir, run_label);
      response.json(ClusterRunResponseSchema.parse(result));
    } finally {
      removeUploadDirectory(uploadDir);
    }
  } catch (error) {
    if (error instanceof ZodError || error instanceof AnalysisInputError) {
      response.status(400).json({ error: "The analysis request or uploaded input manifest is invalid." });
      return;
    }
    if (error instanceof ArtifactValidationError) {
      response.status(422).json({ error: "Research artifacts failed aggregate validation." });
      return;
    }
    if (error instanceof ResearchExecutionError) {
      const status = error.code === "EXECUTION_TIMEOUT" ? 504 : error.code === "ENVIRONMENT_FAILURE" ? 503 : 422;
      response.status(status).json({ error: error.message });
      return;
    }
    next(error);
  } finally {
    synchronousRunActive = false;
  }
});
