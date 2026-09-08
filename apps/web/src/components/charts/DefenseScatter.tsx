import type { DefensePanel } from "../../../../../packages/shared/src";
import { chartPalette } from "./chartPalette";

export const DefenseScatter = ({ panel, label }: { panel: DefensePanel | null; label: string }) => {
  if (!panel) return <p className="existing-note">Validated defense projection geometry is unavailable.</p>;
  // Every panel is contract-validated against the same full ordered projection.
  // Shared coordinate extents therefore produce identical axes without sampling.
  const xs = panel.observations.map((point) => point.pc1);
  const ys = panel.observations.map((point) => point.pc2);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.04 || 1, yPad = (yMax - yMin) * 0.04 || 1;
  const left = xMin - xPad, right = xMax + xPad, bottom = yMin - yPad, top = yMax + yPad;
  const x = (value: number) => 52 + ((value - left) / (right - left)) * 446;
  const y = (value: number) => 266 - ((value - bottom) / (top - bottom)) * 244;
  const colors = [chartPalette.primary, chartPalette.comparison];
  return (
    <figure>
      <svg viewBox="0 0 520 308" className="w-full" role="img" aria-label={`${label}: all 2,437 observations in the common PC1-PC2 projection`}>
        <title>{`${label}: common PC1-PC2 projection, all observations`}</title>
        {[0, 1, 2, 3, 4].map((tick) => {
          const xv = left + ((right - left) * tick) / 4;
          const yv = bottom + ((top - bottom) * tick) / 4;
          return <g key={tick} fill={chartPalette.text} fontSize="11">
            <line x1={x(xv)} x2={x(xv)} y1="22" y2="266" stroke={chartPalette.grid} />
            <line x1="52" x2="498" y1={y(yv)} y2={y(yv)} stroke={chartPalette.grid} />
            <text x={x(xv)} y="282" textAnchor="middle">{xv.toFixed(1)}</text>
            <text x="45" y={y(yv) + 4} textAnchor="end">{yv.toFixed(1)}</text>
          </g>;
        })}
        <g aria-label="Observation projection">
          {panel.observations.map((point, position) => <circle key={position} cx={x(point.pc1)} cy={y(point.pc2)} r="2" fill={colors[point.cluster]} fillOpacity="0.5" />)}
        </g>
        {panel.markers.map((marker) => {
          const mx = x(marker.pc1), my = y(marker.pc2);
          return <g key={`${marker.type}-${marker.cluster}`} stroke={marker.type === "initial" ? chartPalette.neutral : chartPalette.centroid} strokeWidth="2.5" fill="white">
            <title>{`${marker.type === "initial" ? "Initial centroid / seed" : "Final projected centroid"}, Cluster ${marker.cluster}: PC1 ${marker.pc1.toFixed(5)}, PC2 ${marker.pc2.toFixed(5)}`}</title>
            {marker.type === "initial" ? <path d={`M ${mx} ${my - 7} L ${mx + 7} ${my} L ${mx} ${my + 7} L ${mx - 7} ${my} Z`} /> : <path d={`M ${mx - 7} ${my - 7} L ${mx + 7} ${my + 7} M ${mx - 7} ${my + 7} L ${mx + 7} ${my - 7}`} />}
          </g>;
        })}
        <text x="275" y="302" textAnchor="middle" fill={chartPalette.text} fontSize="12">PC1</text>
        <text transform="translate(14 144) rotate(-90)" textAnchor="middle" fill={chartPalette.text} fontSize="12">PC2</text>
      </svg>
      <figcaption className="text-xs text-muted">
        <span style={{ color: colors[0] }}>● Cluster 0</span>{" · "}<span style={{ color: colors[1] }}>● Cluster 1</span>
        {panel.markers.some((marker) => marker.type === "initial") ? " · ◇ Initial centroid / seed" : null}{" · × Final projected centroid"}
      </figcaption>
    </figure>
  );
};
