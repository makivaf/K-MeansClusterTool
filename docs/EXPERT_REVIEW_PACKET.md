# Expert Review Packet

> **LEGACY / HISTORICAL — NOT CURRENT METHODOLOGY:** This review packet describes the superseded two-axis analysis and remains only for review provenance. Do not treat its independent Axis B clustering as part of the active pipeline.

## Study

**Title:** *An Enhancement of the K-Means Clustering Algorithm Applied to Modeling Alzheimer's Disease Progression Using Cognitive Data*

**Researchers:** Jonalene Ryza B. Abundo and Mariel Kim R. Vaflor  
**Adviser:** Ms. Jamillah S. Guialil

## Purpose of review

We request expert review of the clarity and clinical caution of aggregate cluster descriptions. This packet does not ask the reviewer to certify algorithm correctness, diagnose participants, or validate individual assignments. It contains no raw records, participant identifiers, or assignment rows.

## Concise method summary

Axis A analyzed cross-sectional study-entry cognitive/functional profiles. Thirteen retained measures were median-imputed, z-standardized, reduced to six principal components (87.4795% cumulative variance), and evaluated with NbClust (`k=2`). Two DPC-selected observations initialized an otherwise standard Lloyd K-Means fit. The final aggregate sizes were 1,553 and 884.

Axis B was a supplementary longitudinal analysis. Each of 1,917 participants was represented by one OLS ADAS-Cog13 `TOTAL13` slope in points/year from actual `VISDATE` elapsed time (11,327 observations). PCA was not applicable. NbClust selected `k=2`. DPC was investigated but rejected for final initialization because the 1D high-density candidates were tied/nearly coincident and cutoff-unstable. Fixed-seed standard Lloyd K-Means produced a lower-slope group of 1,675 and a higher-slope group of 242.

## Aggregate descriptions available for review

Axis A's public-safe artifact set establishes two cognitive-profile groups and their sizes, but a final authoritative aggregate table of the 13 feature means by cluster was not consolidated. Clinical profile labels should therefore remain pending rather than inferred from participant assignments.

Axis B has direct aggregate slope descriptions:

| Group | n | Share | Centroid | Mean slope | Cautious description |
| --- | ---: | ---: | ---: | ---: | --- |
| 1 | 1,675 | 87.376% | 0.7674 | 0.7701 points/year | Lower-slope progression group |
| 2 | 242 | 12.624% | 9.5888 | 9.6071 points/year | Higher-slope progression group |

Positive slopes mean increasing/worsening ADAS-Cog13 scores. These data-driven groups are not established clinical stages, diagnoses, causal subtypes, or proof of individual prognosis. The higher group's location is sensitive to the positive slope tail.

## Focused expert questions

1. Are “lower-slope progression group” and “higher-slope progression group” understandable and appropriately cautious?
2. Does the description clearly distinguish a data-driven group from a diagnosis or clinical stage?
3. Does any wording overstate what an ADAS-Cog13 slope can establish clinically?
4. Is the caution that negative slopes do not automatically prove clinical improvement sufficient?
5. What aggregate Axis A feature/profile table would be necessary before clinically meaningful cognitive-profile labels could be reviewed?
6. Once that aggregate table is available, which directions or combinations of cognitive/functional means would be essential to report without implying diagnoses?

## Reviewer record (human completion required)

- Reviewer name/role:
- Date:
- Materials reviewed:
- Recommended wording changes:
- Interpretation concerns:
- Signature/acknowledgment if institutionally required:

Preparation of this packet does not constitute expert validation. Review and documented response remain external human actions.
