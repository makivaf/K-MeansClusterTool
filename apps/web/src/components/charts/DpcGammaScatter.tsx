import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { GammaValue, SelectedCentroid } from "../../../../../packages/shared/src";

type DpcGammaScatterProps = {
  gammaValues: GammaValue[];
  selectedCentroids: SelectedCentroid[];
};

export const DpcGammaScatter = ({ gammaValues, selectedCentroids }: DpcGammaScatterProps) => {
  const selectedIds = new Set(selectedCentroids.map((centroid) => centroid.candidate_id));
  const selected = gammaValues.filter((point) => selectedIds.has(point.candidate_id));
  const remainder = gammaValues.filter((point) => !selectedIds.has(point.candidate_id));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#dbe4e4" strokeDasharray="3 3" />
          <XAxis dataKey="candidate_id" name="Candidate" type="category" tickLine={false} axisLine={false} />
          <YAxis dataKey="gamma" name="Gamma" tickLine={false} axisLine={false} />
          <ZAxis range={[80, 180]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter name="Candidates" data={remainder} fill="#b7cfcc" />
          <Scatter name="Selected centroids" data={selected} fill="#d88a00" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
};
