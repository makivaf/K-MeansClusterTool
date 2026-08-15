import path from "node:path";
import { fileURLToPath } from "node:url";
import { FrozenAxisAStudyResultSchema, FrozenAxisBStudyResultSchema } from "../../../../packages/shared/src/schema";
import { adaptAxisAResult } from "./axisAResultAdapter";
import { adaptAxisBResult } from "./axisBResultAdapter";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactDirectory = path.resolve(here, "../../../../data/interim");
const createdAt = "2026-08-13T00:00:00.000Z";
const axisA = adaptAxisAResult(artifactDirectory, { runId: "frozen-study-axis-a-validation", createdAt });
const axisB = adaptAxisBResult(artifactDirectory, { runId: "frozen-study-axis-b-validation", createdAt });
FrozenAxisAStudyResultSchema.parse(axisA);
FrozenAxisBStudyResultSchema.parse(axisB);
if (JSON.stringify([axisA, axisB]).match(/PTID|\bRID\b|participant_assignments/)) throw new Error("Participant-level field escaped a frozen aggregate adapter");
console.log("PASS local aggregate artifacts: frozen Axis A and Axis B results mapped and cardinalities verified");
