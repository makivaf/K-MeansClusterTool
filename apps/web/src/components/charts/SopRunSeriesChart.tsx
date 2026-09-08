import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SopEvaluation } from "../../../../../packages/shared/src";
import { chartPalette } from "./chartPalette";

type Metric = "silhouette" | "daviesBouldin" | "calinskiHarabasz";

export const SopRunSeriesChart = ({ sop3, metric }: { sop3: SopEvaluation["sop3"]; metric: Metric }) => {
  const runs = sop3.randomRuns;
  if (!runs) return <div><p>Validated individual random-run values are unavailable.</p></div>;

  // One validated fixed reference, not a fabricated series of 30 DPC executions.
  const dpc = sop3.controlledComparison;
  const reference = dpc?.metrics[metric];
  const values = runs.map((run) => run[metric]);
  const minimum = Math.min(...values, ...(reference === undefined ? [] : [reference]));
  const maximum = Math.max(...values, ...(reference === undefined ? [] : [reference]));
  const padding = Math.max((maximum - minimum) * 0.15, Math.abs(maximum) * 1e-6, 1e-8);

  return (
    <figure>
      <div className="mt-3 h-64 w-full" role="img" aria-label={`${metric}: ${runs.length} measured random-initialization runs${dpc ? "; validated fixed DPC reference" : "; DPC reference pending"}.`}>
        <ResponsiveContainer>
          <LineChart data={runs} margin={{ top: 25, right: 25, bottom: 20, left: 30 }}>
            <CartesianGrid stroke={chartPalette.grid} />
            <XAxis type="number" dataKey="runNumber" domain={[1, runs.length]} ticks={runs.filter((run) => run.runNumber === 1 || run.runNumber % 5 === 0).map((run) => run.runNumber)} label={{ value: "Random run number", position: "insideBottom", offset: -12 }} />
            <YAxis domain={[minimum - padding, maximum + padding]} tickFormatter={(value: number) => value.toFixed(6)} width={95} />
            <Tooltip formatter={(value: number) => [value.toFixed(8), "Random initialization"]} labelFormatter={(number) => `Run ${number}, seed ${runs.find((run) => run.runNumber === Number(number))?.seed}`} />
            <Line type="linear" dataKey={metric} name="Random initialization" stroke={chartPalette.primary} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            {reference === undefined ? null : <ReferenceLine y={reference} stroke={chartPalette.comparison} strokeDasharray="6 4" label={{ value: "DPC fixed reference", position: "insideTopRight", fill: chartPalette.text }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        {runs.length} measured random runs (seeds {runs[0].seed}–{runs[runs.length - 1].seed}).
        {dpc ? ` Dashed line: validated fixed DPC value ${reference?.toFixed(8)}, reproduced in ${dpc.repeatedChecks} checks; not 30 independent DPC executions.` : " Validated controlled DPC reference pending."}
        {" "}The vertical axis is expanded to show the small observed differences.
      </figcaption>
    </figure>
  );
};
