# Number formatter call sites

All numeric rendering delegates to formatNumber; compatibility wrappers retain six-decimal calculation, two-decimal percentage and integer count kinds. Date/time toLocaleString and RID Intl.Collator are not number rendering and remain unchanged.

## apps/web/src/components/MethodExecutionControls.tsx

- Line 43: `<dl>{Object.entries(saved.result.timings).map(([name, seconds]) => <div key={name}><dt>{name.replace(/_/g, " ")}</dt><dd>{formatNumber(seconds, "duration")} seconds</dd></div>)}</dl>`

## apps/web/src/components/MetricComparisonTable.tsx

- Line 9: `export const formatMetric = (value: number | undefined, _useGrouping = false) => formatNumber(value, "metric");`

## apps/web/src/components/InitializationComparison.tsx

- Line 27: `const continuous = (value?: number) => value === undefined ? "Unavailable" : formatNumber(value, "ari");`
- Line 56: `<YAxis domain={[minimum, 1]} width={88} tickFormatter={(value: number) => formatNumber(value, "axis")}`
- Line 60: `<Tooltip formatter={(value: number) => [formatNumber(value, "ari"), "ARI"]} labelFormatter={value => ${axisLabel} ${value}} />`
- Line 156: `<table className="research-table research-row-dividers sop-table"><thead><tr><th scope="col">Random seed</th><th scope="col">ARI versus DPC</th></tr></thead><tbody>{controlledRuns.map(row => <tr key={row.seed}><th scope="row">{row.seed}</th><td>{formatNumber(row.adjustedRandIndex, "ari")}</td></tr>)}</tbody></table>`

## apps/web/src/components/PcaLoadingMatrix.tsx

- Line 41: `{value === null ? "\u2014" : ${value > 0 ? "+" : ""}${formatNumber(value, "loading")}}`

## apps/web/src/components/FreshStudyResults.tsx

- Line 48: `Standard seed 0 versus Enhanced: ARI {formatNumber(comparison!.commonSpace!.crossMethod[0].ari, "ari")}; {formatNumber(comparison!.commonSpace!.crossMethod[0].disagreementCount, "count")} participants assigned differently after label alignment.`
- Line 74: `<p className="simulation-compact-note">{enhanced.common.retainedVariables.length} variables {" -> "}{pca.pcaComponents} PCs, {formatNumber(pca.cumulativeExplainedVariance * 100, "percentage")} variance</p>`
- Line 96: `{paired && <p className="sop3-note">Standard pairwise ARI: mean {formatNumber(comparison!.commonSpace!.pairwise.standard.mean, "ari")}, minimum {formatNumber(comparison!.commonSpace!.pairwise.standard.minimum, "ari")}.`
- Line 97: `Enhanced pairwise ARI: mean {formatNumber(comparison!.commonSpace!.pairwise.enhanced.mean, "ari")}, minimum {formatNumber(comparison!.commonSpace!.pairwise.enhanced.minimum, "ari")}.</p>}`

## apps/web/src/components/SopComparison.tsx

- Line 54: `<td>{row.eigenvalue === undefined ? "Unavailable" : formatNumber(row.eigenvalue, "eigenvalue")}</td>`
- Line 60: `return <li key={loadingData.variables[index]}><span className="research-badge is-valid">{loadingData.variables[index]}</span><strong className="tabular-nums">{value > 0 ? "+" : ""}{formatNumber(value, "loading")}</strong></li>;`

## apps/web/src/components/DpcCenterTable.tsx

- Line 21: `<td>{formatNumber(center.rho, "rho")}</td>`
- Line 22: `<td>{formatNumber(center.delta, "delta")}</td><td className="dpc-center-gamma">{formatNumber(center.gamma, "gamma")}</td>`

## apps/web/src/components/SopFigures.tsx

- Line 10: `export const silhouetteTick = (value: number) => formatNumber(value, "axis");`
- Line 12: `export const pcaPercentTick = (value: number) => ${formatNumber(value * 100, "count")}%;`
- Line 54: `? <div className="simulation-chart-plot" role="img" aria-label="Silhouette by candidate k"><ResponsiveContainer width="100%" height={280} minWidth={0}><LineChart data={candidates}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="k" interval={0} /><YAxis tickFormatter={axisNumber} width={56} /><Tooltip formatter={(value: number) => formatNumber(value, "metric")} /><Line dataKey="silhouette" stroke="var(--simulation-teal, var(--research-primary))" isAnimationActive={false} /></LineChart></ResponsiveContainer></div>`

## apps/web/src/components/charts/PartitionProjection.tsx

- Line 7: `export const projectionTick = (value: number) => formatNumber(value, "axis2");`
- Line 33: `<Tooltip formatter={(value: number, name: string) => [formatNumber(value, "calculation"), name]} />`

## apps/web/src/components/charts/FinalFindingsCharts.tsx

- Line 12: `const percent = (value: number) => formatNumber(value * 100, "percentage");`
- Line 23: `{row.map((value, j) => <td key={j} className="text-center tabular-nums" title={${correlation.features[i]} / ${correlation.features[j]}: ${value === null ? "Undefined (constant feature)" : formatNumber(value, "correlationTooltip")}}`
- Line 24: `style={{ backgroundColor: value === null ? "var(--research-border)" : color-mix(in srgb, ${value >= 0 ? teal : chartPalette.comparison} ${Math.abs(value) * 70}%, transparent) }}><span>{value === null ? "—" : formatNumber(value, "correlation")}</span></td>)}`
- Line 40: `<YAxis tick={tick} tickFormatter={(value: number) => formatNumber(value, "axis2")} />`
- Line 41: `<Tooltip formatter={(value: number) => [formatNumber(value, "metric"), "Silhouette"]} labelFormatter={value => k=${value}} />`
- Line 55: `<YAxis domain={[(minimum: number) => Math.max(-1, minimum - 0.001), 1]} tick={tick} tickFormatter={(value: number) => formatNumber(value, "axis")} width={75} label={{ value: "ARI", angle: -90, position: "insideLeft", fontSize: "var(--research-body-size)" }} />`
- Line 56: `<Tooltip formatter={(value: number) => [formatNumber(value, "ari"), "ARI vs DPC"]} labelFormatter={value => Seed ${value}} />`
- Line 74: `<Tooltip formatter={(value: number) => [formatNumber(value, "gamma"), "Gamma"]} />`
- Line 77: `<LabelList dataKey="gamma" position="top" formatter={(value: number) => formatNumber(value, "axis2")} fontSize="var(--research-body-size)" />`
- Line 142: `<div className="h-64 w-full" role="img" aria-label={${metricTitles[metric.metric]}: standard baseline ${formatNumber(metric.baselineValue, "metric")}; enhanced ${formatNumber(metric.enhancedValue, "metric")}.}>`
- Line 148: `<Tooltip formatter={(value: number) => formatNumber(value, "metric")} />`
- Line 149: `<Bar dataKey="value" isAnimationActive={false}><Cell fill={chartPalette.comparison} /><Cell fill={teal} /><LabelList dataKey="value" position="top" formatter={(value: number) => formatNumber(value, "metric")} fontSize="var(--research-body-size)" /></Bar>`
- Line 172: `<Tooltip labelFormatter={(_label, payload) => getMeasureLabel(payload[0]?.payload.variable ?? "")} formatter={(value: number) => [formatNumber(value, "metric"), "SMD (1 − 0)"]} />`
- Line 175: `<LabelList dataKey="standardizedMeanDifferenceCluster1Minus0" position="right" formatter={(value: number) => formatNumber(value, "axis")} fontSize="var(--research-body-size)" />`

## apps/web/src/components/MethodDecisionGraph.tsx

- Line 17: `<Tooltip formatter={(value: number, name: string) => [formatNumber(value, name === "rho" ? "rho" : "delta"), name]} cursor={{ strokeDasharray: "3 3" }} />`

## apps/web/src/components/InternalValidationCalculationDetails.tsx

- Line 13: `const f = (value?: number) => formatNumber(value, "calculation");`
- Line 49: `<div className="calculation-chips"><span>N {formatNumber(method.n,"count")}</span><span>K {formatNumber(method.k,"count")}</span><span>{name}</span><span>{evaluationSpace}</span></div>`
- Line 63: `<p>CH = (SSB / (K-1)) / (SSW / (N-K))</p><dl><div><dt>SSB</dt><dd>{f(ch?.ssb)}</dd></div><div><dt>SSW</dt><dd>{f(ch?.ssw)}</dd></div><div><dt>N</dt><dd>{formatNumber(method.n,"count")}</dd></div><div><dt>K</dt><dd>{formatNumber(method.k,"count")}</dd></div></dl>`
- Line 64: `{ch && <p data-formula="ch">({f(ch.ssb)} / ({formatNumber(method.k,"count")}-1)) / ({f(ch.ssw)} / ({formatNumber(method.n,"count")}-{formatNumber(method.k,"count")})) = {f(metricResult?.calinski_harabasz)}</p>}`
- Line 66: `{method.summary && method.runCount===30 && <section><h5>30-run summary</h5><table className="research-table"><thead><tr><th>Metric</th><th>Mean</th><th>SD</th><th>Min</th><th>Max</th></tr></thead><tbody>{metricDefinitions.map(({key,label})=><tr key={key}><th>{label}</th>{[method.summary!.mean[key],method.summary!.sd[key],method.summary!.minimum[key],method.summary!.maximum[key]].map((value,i)=><td key={i}>{formatNumber(value,"metric")}</td>)}</tr>)}</tbody></table>{validRange && <p>Stored seed 0 lies within this range</p>}</section>}`

## apps/web/src/pages/StudyFindingsPage.tsx

- Line 287: `<p className="study-lme-slope-value">{formatNumber(entry.estimate, "lme")}</p>`
- Line 294: `<div><dt>Difference in annual change</dt><dd>{formatNumber(result.estimate, "lme")} <span className="study-lme-unit">points/year</span></dd></div>`
- Line 295: `<div><dt>95% CI</dt><dd>{formatNumber(result.confidenceInterval95.lower, "lme")} to {formatNumber(result.confidenceInterval95.upper, "lme")}</dd></div>`
- Line 296: `<div><dt>p-value</dt><dd>{formatNumber(result.pValue, "pValue")}</dd></div>`
- Line 300: `<dl className="study-lme-statistics"><div><dt>Time-by-cluster difference</dt><dd>{formatNumber(effect.estimate, "lme")} points/year</dd></div>`
- Line 301: `<div><dt>95% CI</dt><dd>{formatNumber(effect.ci95[0], "lme")} to {formatNumber(effect.ci95[1], "lme")}</dd></div>`
- Line 302: `<div><dt>p-value</dt><dd>{formatNumber(effect.pValue, "pValue")}</dd></div></dl>`

## apps/web/src/utils/numberFormatting.ts

- Line 4: `export const formatContinuous = (value: number | undefined, unavailable = "—") => formatNumber(value, "calculation", unavailable);`
- Line 5: `export const formatPercent = (value: number) => formatNumber(value, "percentage");`
- Line 6: `export const formatInteger = (value: number) => formatNumber(value, "count");`

## Intentional test expectation updates

- lmeCard.test.mjs, studyFindings.test.mjs, finalPresentation.test.mjs: LME estimates/CIs to three decimals and spaced p-value threshold.
- pcaLoadingMatrix.test.mjs, varianceSummary.test.mjs, studyFindings.test.mjs: three-decimal PCA loadings/eigenvalues; loading matrix stays visible with Expand.
- initializationComparison.test.mjs: four-decimal ARI/delta and two-decimal gamma.
- metricComparison.test.mjs: short Difference header/caption and seed-based formulas, preserving supplied intermediates and rejecting fabricated representative rows.
- silhouetteCalculation.test.mjs: short column labels and Rows X to Y of N pagination; sorting, bounds, full-record gating and all row values remain tested.
- varianceSummary.test.mjs: isolated the new dialog boolean state in its existing row-toggle harness; row-toggle assertions are unchanged.

- marielBackendIntegration.test.mjs: shortened Difference header, direction retained in caption, four-decimal common-space mean and explicit six-decimal stored-seed result assertion.
