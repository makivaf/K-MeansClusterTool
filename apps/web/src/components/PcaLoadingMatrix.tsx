import { ChevronDown } from "lucide-react";
import { formatContinuous } from "../utils/numberFormatting";
import { getMeasureLabel } from "../utils/measureLabels";
import "./SopComparison.css";
import "./PcaLoadingMatrix.css";

import { topLoadingRows, type PcaLoadings } from "../utils/pcaLoadings";
export { topLoadingRows } from "../utils/pcaLoadings";
export type { PcaLoadings } from "../utils/pcaLoadings";

export const PcaLoadingMatrix = ({ variables, components, values, topCount = 3, defaultExpanded = true }: {
  variables: readonly string[];
  components: readonly string[];
  values?: PcaLoadings;
  topCount?: number;
  defaultExpanded?: boolean;
}) => {
  const retainedComponents = components.length;
  const valid = values && values.length === variables.length && values.every(row => row.length >= retainedComponents &&
    row.slice(0, retainedComponents).every(value => value === null || typeof value === "number" && Number.isFinite(value)));
  const matrix = valid ? values : undefined;
  const highlighted = components.map((_, component) => new Set(matrix ? topLoadingRows(matrix, component, topCount) : []));
  const maximum = matrix ? Math.max(0, ...matrix.flatMap(row => row.slice(0, retainedComponents).map(value => Math.abs(value ?? 0)))) : 0;
  if (variables.length === 0 || retainedComponents < 1) return null;
  return <section className="sop-support-card pca-loading-card">
    <h3 className="card-title mb-2">Principal Components — Loading Matrix</h3>
    <p className="text-sm text-muted">Contribution of the {variables.length} standardized cognitive variables to the {retainedComponents} retained principal components.</p>
    <p className="pca-loading-summary">{variables.length} variables × {retainedComponents} retained PCs</p>
    <details className="pca-loading-disclosure" open={defaultExpanded}>
      <summary className="research-text-action"><span className="pca-loading-show">Show Loading Matrix</span><span className="pca-loading-hide">Hide Loading Matrix</span><ChevronDown size={14} aria-hidden="true" /></summary>
      <>
        <div className="pca-loading-scroll" role="region" aria-label="PCA loading matrix" tabIndex={0}>
          <table className="pca-loading-table">
            <thead><tr><th scope="col">Variable</th>{components.map(component => <th scope="col" key={component}>{component}</th>)}</tr></thead>
            <tbody>{variables.map((variable, row) => <tr key={variable}>
              <th scope="row"><abbr title={getMeasureLabel(variable)}>{variable}</abbr></th>
              {components.map((label, component) => {
                const value = matrix?.[row][component] ?? null;
                const strongest = highlighted[component].has(row);
                const intensity = value === null || maximum === 0 ? 0 : 65 * Math.abs(value) / maximum;
                return <td key={component} className={value === null ? "is-placeholder" : strongest ? "is-strongest" : undefined}
                  style={value === null ? undefined : { backgroundColor: `color-mix(in srgb, var(${value !== null && value < 0 ? "--research-comparison" : "--research-primary"}) ${intensity}%, white)` }}>
                  {value === null ? "\u2014" : `${value > 0 ? "+" : ""}${formatContinuous(value)}`}
                  {strongest && <span className="sr-only"> · top {topCount} absolute loading for {label}</span>}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        {matrix ? <><div className="pca-loading-legend"><span>Strong negative</span><span className="pca-loading-swatches" aria-hidden="true">{[-65, -25, 0, 25, 65].map(value => <i key={value} style={{ backgroundColor: `color-mix(in srgb, var(${value < 0 ? "--research-comparison" : "--research-primary"}) ${Math.abs(value)}%, white)` }} />)}</span><span>← 0 → Strong positive</span></div>
        <p className="text-xs text-muted">Highlighted cells indicate the {topCount === 3 ? "three" : topCount} largest absolute loadings within each retained component.</p>
        <p className="mt-2 text-xs text-muted">Color shows loading direction and magnitude; negative loadings are not unfavorable. Ties follow variable order.</p></> : <p className="mt-3 text-xs text-muted" role="status">Loading values will appear when PCA loading data is available.</p>}
      </>
    </details>
  </section>;
};
