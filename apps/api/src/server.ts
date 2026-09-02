import "dotenv/config";
import { app } from "./app";
import { cleanupStaleUploads } from "./services/localUploadStore";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.API_HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

if (process.env.NODE_ENV !== "production") cleanupStaleUploads();

app.listen(port, host, () => {
  console.log(`AD clustering API listening on ${host}:${port}`);
});
