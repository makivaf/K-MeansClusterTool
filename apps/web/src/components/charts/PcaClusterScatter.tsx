/**
 * Aggregate-safe raster generated from the validated clustering PCA scores
 * (SHA-256 abf2c7a98c65f7d0b609bd14389b20be930d5850bc8a4f213d383a8eb432f4b0)
 * joined to the frozen enhanced assignments
 * (SHA-256 a98289c9f4548d26daf40060f13f07e18d9254f74e0f232d02cea016302090c5).
 * Participant identifiers and reusable point coordinates are not web-exposed.
 */
export const PcaClusterScatter = () => (
  <figure>
    <img
      src="/pca-cluster-scatter.png"
      width={1600}
      height={900}
      loading="lazy"
      className="h-auto w-full rounded-lg"
      alt="PCA scatter plot of 2,437 participants. PC1 is on the horizontal axis and PC2 is on the vertical axis. Cluster 0 contains 1,553 teal points and Cluster 1 contains 884 amber points."
    />
    <figcaption className="mt-3 text-xs leading-5 text-muted">
      This is a two-dimensional visualization of PC1 and PC2. The final enhanced K-Means clustering used the full six-dimensional PCA space.
    </figcaption>
  </figure>
);
