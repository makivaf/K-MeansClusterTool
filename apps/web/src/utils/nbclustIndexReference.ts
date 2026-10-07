// Presentation metadata only; recommendations always come from result evidence.
// Rules: https://cran.r-project.org/web/packages/NbClust/NbClust.pdf (Index table).
const maximum = "Prefer the peak score";
const minimum = "Prefer the lowest score";
const change = "Strongest change between successive cluster counts";
export const nbclustIndexReference: Record<string, readonly [string, string]> = {
  kl: ["Change in within-cluster dispersion", maximum],
  ch: ["Between/within-cluster separation", maximum],
  hartigan: ["Reduction in within-cluster dispersion", change],
  ccc: ["Clustering relative to a uniform reference", maximum],
  scott: ["Change in covariance dispersion", change],
  marriot: ["Within-cluster covariance determinants", "Peak second-order change"],
  trcovw: ["Within-cluster covariance trace", change],
  tracew: ["Within-cluster dispersion", "Largest absolute second-order change"],
  friedman: ["Between/within-cluster dispersion", change],
  rubin: ["Total/within-cluster dispersion", "Lowest second-order change"],
  cindex: ["Pairwise compactness", minimum],
  db: ["Scatter relative to separation", minimum],
  silhouette: ["Cohesion relative to separation", maximum],
  duda: ["Dispersion before and after splitting", "First k whose score exceeds its critical threshold"],
  pseudot2: ["Evidence for a cluster split", "First k whose score falls below its critical threshold"],
  beale: ["Significance of a cluster split", "Critical value meets the configured alpha threshold"],
  ratkowsky: ["Variance explained by clusters", maximum],
  ball: ["Mean within-cluster dispersion", change],
  ptbiserial: ["Association of membership and distance", maximum],
  gap: ["Dispersion relative to reference data", "First k satisfying the critical-value criterion"],
  frey: ["Changes in within/between distances", "Cluster count preceding a score below one"],
  mcclain: ["Within/between-cluster distances", minimum],
  gamma: ["Agreement of distances and membership", maximum],
  gplus: ["Discordant pairwise comparisons", minimum],
  tau: ["Rank agreement of distances and membership", maximum],
  dunn: ["Separation relative to cluster diameter", maximum],
  hubert: ["Association of distances and partition", "Graphical assessment of the index curve"],
  sdindex: ["Scatter and separation", minimum],
  dindex: ["Within-cluster distances", "Graphical assessment of the index curve"],
  sdbw: ["Scatter and between-cluster density", minimum]
};
