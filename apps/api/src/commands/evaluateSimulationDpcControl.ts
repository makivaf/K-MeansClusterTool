import { evaluateSimulationDpcControl } from "../services/simulationDpcControl";

const id = Number(process.argv[2]);
if (process.argv.length !== 3 || !Number.isInteger(id) || id < 1 || id > 5) {
  throw new Error("Usage: tsx src/commands/evaluateSimulationDpcControl.ts <simulation-id 1–5>");
}
console.log(JSON.stringify(await evaluateSimulationDpcControl(id), null, 2));
