# AD Clustering Lab

A research-oriented clustering application developed to support the study:

> **An Enhancement of the K-Means Clustering Algorithm Applied to Modeling Alzheimer's Disease Progression Using Cognitive Data**

The project provides a reproducible computational workflow for analyzing cognitive and functional data from the Alzheimer's Disease Neuroimaging Initiative (ADNI). It combines research scripts with a web-based interface for executing and reviewing the clustering analyses used in the study.

## Research Overview

The study investigates the application of K-Means clustering to Alzheimer's disease progression modeling using cognitive and functional measurements.

The analysis is divided into two complementary components:

### Axis A — Cross-Sectional Cognitive and Functional Profiles

Axis A analyzes participants using multiple cognitive and functional measures at study entry.

The research workflow includes:

- Data quality and missingness assessment
- Feature preparation
- Median imputation
- Standardization
- Principal Component Analysis (PCA)
- Cluster-count selection
- Density-Peak-based initialization assessment
- K-Means clustering
- Baseline and enhanced-method comparison
- Aggregate cluster profiling

The finalized analysis uses **13 retained cognitive and functional features** and **six principal components**, preserving approximately **87.5% of the total variance**.

The selected number of clusters is:

**k = 2**

### Axis B — Longitudinal Progression

Axis B provides a supplementary longitudinal analysis based on change in ADAS-Cog13 scores over time.

Participant-level progression is represented using an estimated longitudinal slope:

**ADAS-Cog13 points per year**

Participants included in this analysis satisfy the predefined longitudinal observation requirements.

Because Axis B contains only one clustering dimension:

- PCA is not applicable.
- DPC initialization was evaluated for methodological suitability but was not retained for the final analysis.
- Final clustering uses standard fixed-seed Lloyd K-Means.

The selected number of clusters is:

**k = 2**

Axis B therefore provides an additional view of progression based on longitudinal cognitive change rather than the multivariate cross-sectional profile used in Axis A.

## Application

The AD Clustering Lab provides an interface for executing and reviewing the research workflow.

The application includes views for:

- Dataset upload and research execution
- Analysis dashboard
- Preprocessing summaries
- PCA results
- Cluster-count selection
- DPC initialization or suitability analysis
- Clustering comparison
- Aggregate cluster profiles

The interface is designed to display validated research outputs while maintaining separation between raw research data and aggregate reporting results.

## Project Structure

The repository is organized into separate application, research, documentation, and data areas.

```text
K-MeansClusterTool/
├── apps/
│   ├── web/                 # Web application
│   └── api/                 # Application services
│
├── scripts/
│   └── research/            # Reproducible research workflows
│
├── data/
│   ├── raw/                 # Local research inputs
│   ├── interim/             # Intermediate research artifacts
│   └── processed/           # Final reporting artifacts
│
├── docs/                    # Architecture and research documentation
│
├── packages/                # Shared application components
│
└── README.md
