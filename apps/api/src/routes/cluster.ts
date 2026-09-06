// DUA compliance: uploaded CSV files may contain raw participant-level research data.
// These local-only routes are mounted only outside production, and raw CSVs stay on local disk only.
import path from "node:path";
import express, { type Request } from "express";
import multer from "multer";
import { UploadResponseSchema } from "../../../../packages/shared/src/schema";
import { AnalysisInputError, validateAnalysisInputManifest } from "../services/analysisInputManifest";
import {
  createUploadDirectory,
  removeUploadDirectory,
  resolveUploadDirectory
} from "../services/localUploadStore";
import { createFixedWindowRateLimiter, requireTrustedBrowserOrigin } from "../httpSecurity";

type UploadRequest = Request & {
  uploadBatchId?: string;
};

const defaultMaxCsvBytes = 64 * 1024 * 1024;
const configuredMaxCsvBytes = Number(process.env.RESEARCH_MAX_CSV_BYTES ?? defaultMaxCsvBytes);
const maxCsvBytes = Number.isSafeInteger(configuredMaxCsvBytes) && configuredMaxCsvBytes > 0
  ? configuredMaxCsvBytes
  : defaultMaxCsvBytes;
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
    files: 7,
    fields: 0
  },
  fileFilter: (_request, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== ".csv") {
      callback(new Error("Only .csv dataset files are accepted."));
      return;
    }
    callback(null, true);
  }
}).array("files");

const uploadErrorMessage = (error: unknown): string => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") return "A CSV file exceeds the configured size limit.";
  if (error instanceof multer.MulterError && ["LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE"].includes(error.code)) return "Upload contains more than seven CSV files.";
  if (error instanceof multer.MulterError && error.code === "LIMIT_PART_COUNT") return "The upload request contains too many multipart parts.";
  if (error instanceof multer.MulterError && error.code === "LIMIT_FIELD_COUNT") return "Only the seven CSV file parts are accepted.";
  if (error instanceof Error && ["Only .csv dataset files are accepted.", "A dataset filename is invalid."].includes(error.message)) return error.message;
  return "Unable to store the uploaded CSV files.";
};

export const clusterRouter = express.Router();

const uploadRateLimiter = createFixedWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  maximumRequests: 4,
  message: "Too many local research requests. Try again later."
});

const requireUploadSizeLimit: express.RequestHandler = (request, response, next) => {
  const contentLength = Number(request.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxUploadRequestBytes) {
    response.status(413).json({ error: "The upload request exceeds the configured size limit." });
    return;
  }
  next();
};

clusterRouter.post("/api/upload", requireTrustedBrowserOrigin, uploadRateLimiter, requireUploadSizeLimit, assignUploadBatch, (request: UploadRequest, response, next) => {
  csvUpload(request, response, (error) => {
    if (error) {
      if (request.uploadBatchId) {
        try { removeUploadDirectory(resolveUploadDirectory(request.uploadBatchId)); } catch { /* best-effort cleanup */ }
      }
      response.status(400).json({ error: uploadErrorMessage(error) });
      return;
    }
    next();
  });
});

clusterRouter.post("/api/upload", (request: UploadRequest, response) => {
  const files = Array.isArray(request.files) ? request.files : [];
  if (files.length === 0 || !request.uploadBatchId) {
    if (request.uploadBatchId) {
      try { removeUploadDirectory(resolveUploadDirectory(request.uploadBatchId)); } catch { /* best-effort cleanup */ }
    }
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
