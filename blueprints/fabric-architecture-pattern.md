# Microsoft Fabric — Comprehensive Reference Architecture Pattern
**Status:** Draft v0.5
**Authors:** Alexander Arvidsson / Advania
**Last updated:** 2026-03-09

---

## Table of Contents

1. [Introduction & Purpose](#1-introduction--purpose)
2. [Architecture Tier Definitions](#2-architecture-tier-definitions)
3. [Capacity Architecture & Cost Analysis](#3-capacity-architecture--cost-analysis)
4. [Workspace Architecture](#4-workspace-architecture)
5. [Medallion Architecture & Data Layers](#5-medallion-architecture--data-layers)
6. [Data Engineering Standards](#6-data-engineering-standards)
7. [CI/CD & FabricOps Framework](#7-cicd--fabricops-framework)
8. [Reporting & Power BI](#8-reporting--power-bi)
9. [Identity & Access Management](#9-identity--access-management)
10. [Governance & Data Management](#10-governance--data-management)
11. [Security Architecture](#11-security-architecture)
12. [Gateways](#12-gateways)
13. [Monitoring & Operations](#13-monitoring--operations)
14. [Business Continuity & Disaster Recovery](#14-business-continuity--disaster-recovery)
15. [Naming Conventions](#15-naming-conventions)
16. [Scalability & Migration Path](#16-scalability--migration-path)
17. [Platform Documentation Standards](#17-platform-documentation-standards)
18. [Appendix](#18-appendix)

---

## 1. Introduction & Purpose

This document defines a **reference architecture pattern** for Microsoft Fabric-based data platforms. It is designed as a **sliding-scale, tier-based blueprint** that serves environments ranging from a single team using a minimal footprint, up to large enterprises operating complex, multi-domain, multi-environment data platforms.

The pattern is opinionated in the following ways:

- Storage and compute are always based on **Microsoft Fabric Lakehouses** with a **Medallion architecture**.
- Data engineering is performed using **Python/DuckDB notebooks** for lighter workloads and **PySpark notebooks** for heavier ones.
- Reporting is exclusively through **Power BI** with **Organisational Apps** for distribution.
- Identity management avoids all dependency on named individuals, using **Workspace Identities** and **Service Principals** throughout.

---

## 2. Architecture Tier Definitions

### 2.1 Tier Comparison Matrix

| Dimension | Medium (M) |
|---|---|
| **Target** | 2–5 teams, 1–3 domains |
| **Environments** | Dev + Prod | 
| **Workspaces** | 6 | 
| **Capacities** | 1 × F8+ | 
| **CI/CD** | Basic pipeline |
| **FUAM monitoring** | Maybe | 
| **Purview** | Maybe | 
| **HA Gateway** | No |
| **PIM** | Required if P2 |

### 2.2 Small Tier (S)

A minimal, single-team environment designed for proof-of-concepts, departmental analytics, or organisations that do not yet require process-separated CI/CD or governance tooling. The entire platform runs on a single F2 capacity. All Fabric items live across three workspaces following the FabricOps layer model: a **core** workspace for shared infrastructure (fabutils, config), a **store** workspace containing all lakehouses and engineering notebooks, and a **present** workspace for semantic models, reports, and Organisational Apps. Despite its simplicity, the workspace structure uses the same FabricOps layer names as larger tiers, ensuring a clean upgrade path.

Upgrade trigger recommendations: when user count exceeds ~50 active consumers, when more than one business domain needs to be served, or when refresh schedules or compute contention begin to impact SLAs.

### 2.3 Medium Tier (M)

The medium tier introduces a development environment alongside production, retaining the same three FabricOps workspace types as small (Core, Store, Present). FUAM (Fabric Unified Admin Monitoring) is deployed for consolidated capacity and admin monitoring in a dedicated platform monitoring workspace. A single capacity (minimum F8, F16 recommended) underpins the environment. A basic CI/CD pipeline using FabricOps automates deployments from dev to production. Purview is onboarded for cataloguing and lineage. The Ingest, Prepare, and Orchestrate component layers are consolidated into the Store workspace; the Model layer is consolidated into the Present workspace.

Upgrade trigger recommendations: when workload peaks cause capacity contention, when multiple teams need isolated dev environments, or when audit/compliance requirements demand environment separation between dev and test.

---

## 4. Workspace Architecture

### 4.1 The Seven Workspace Types

The enterprise-tier workspace model defines seven workspace types that map directly to the FabricOps framework's component layer folders. All smaller tiers are a **consolidation** of these seven — the types still exist conceptually, they are simply co-hosted:

| # | Workspace Type | FabricOps Component | Contents | Primary Audience |
|---|----|---|---|---|
| 1 | **Store** | Landing data artifacts | Platform Engineering |
| 2 | **Engineering** | Notebooks, Copy Jobs, ingestion pipelines | Data Engineering |
| 3 | **Analytics** | Semantic models, reports, ontologies | Analytics/BI |

### 4.2 Workspace Topology by Tier

#### Medium — 6 Workspaces (Dev + Prod, 3 types)

Store, Engineering, Analytics across two environments.

```
ws-[domain]-store-dev               → lakehouses
ws-[domain]-engineering-dev         → all engineering notebooks & pipelines
ws-[domain]-analytics-dev           → Semantic models, reports (dev)

ws-[domain]-store-prd               → lakehouses
ws-[domain]-engineering-prd         → all engineering notebooks & pipelines
ws-[domain]-analytics-prd           → Semantic models, reports, apps (prod)
```

### 4.4 Lakehouse Shortcut Strategy

Where multiple workspaces need to read data from another workspace's lakehouse without duplicating it, use **OneLake Shortcuts**. This is the preferred mechanism for making curated or enriched data available to reporting workspaces without copying. Shortcuts are read-only by design from the consuming side, which aligns with the medallion architecture's layer isolation principle.

---

## 5. Medallion Architecture & Data Layers

### 5.1 Layer Definitions

| Layer | Lakehouse Name Pattern | Contents | Transformation Applied |
|---|---|---|---|
| **Archive** | `lh_[domain]_archive` | Raw files exactly as received (CSV, JSON, Parquet, Excel, binary) | None — append only |
| **Raw** | `lh_[domain]_raw` | Schema-validated Delta tables; one table per source object | Schema enforcement, type casting, arrival metadata |
| **Clean** | `lh_[domain]_clean` | Cleansed, deduplicated | Views where data is cleaned, duplicates removed, key/attribute fields are expanded with descriptions, columns are adapted and data types are conformed, usually implemented via Materialized Lake Views |
| **Transformed** | `lh_[domain]_transformed` | Conformed/integrated data aligned to enterprise data model | Tables and views where data is conformed in name and structure and joined to other tables within the same data source. MLVs |
| **Consolidated** | `lh_[domain]_consolidated` | Consolidated data across sources | Tables and views containing data that has been consolidated and enriched across sources to provide a unified view of the business. MLVs. |
| **Semantic** | `lh_[domain]_semantic` | Reporting-ready pre-aggregated tables and views | Final calculations, row-level security support tables, complete star schema models with facts and dimensions, optimized for semantic models and reporting. |

Power BI connects to the Semantic layer using **Direct Lake** mode wherever possible, falling back to Import mode for complex DAX scenarios or when semantic model size or query patterns require it.

### 5.2 Lakehouse Design Principles

Each lakehouse contains a `Tables` section (Delta Lake managed tables) and a `Files` section (unmanaged files). The following conventions apply:

- **Landing** uses only the `Files` section — files land here unchanged.
- **Raw and above** use only the `Tables` section — all data is Delta Lake format.
- Tables within each lakehouse are organised by **domain schema**: `[source_system].[entity_name]` (e.g., `sap.sales_order`).
- No cross-lakehouse joins are performed at the notebook level — data is materialised into the target layer.

**`_sys` schema — two tiers:**

Each data lakehouse contains a `_sys` schema for metadata that is **specific to that lakehouse**:

| Table | Description |
|---|---|
| `_sys.watermark` | High-water mark per source object loaded into this lakehouse |
| `_sys.dq_results` | Data quality check results for tables in this lakehouse |
| `_sys.catalogue` | Table inventory, sensitivity classification, SLA tier |

A dedicated **Operations lakehouse** (`LH_MONIT_platform_ops`) in the Platform Monitoring workspace holds **platform-wide, cross-lakehouse** metadata:

| Table | Description |
|---|---|
| `_sys.run_log` | Execution record for every notebook and pipeline run across all domains |
| `_sys.run_config` | Load configuration (schedule, active flag, batch size) per pipeline |
| `_sys.pipeline_config` | Orchestration metadata (dependency order, parallelism) |
| `_sys.alert_config` | Alert routing rules and thresholds |
| `_sys.backup_log` | Backup execution records |
| `_sys.streaming_config` | Reserved for future streaming configuration |

---

## 6. Data Engineering Standards

### 6.1 Technology Selection: DuckDB vs PySpark

| Criterion | Use DuckDB (Python notebook) | Use PySpark (Spark notebook) |
|---|---|---|
| Table size | < 50M rows / < 5 GB | > 50M rows / > 5 GB |
| Complexity | Single-table transforms, light joins | Complex multi-table joins, ML pipelines |
| Latency requirement | Interactive / ad hoc | Scheduled batch |
| Cost sensitivity | Lower vCore consumption | Higher vCore; use for scale |
| Developer skill | Python-first | Spark-familiar team |

DuckDB notebooks run on the standard Fabric notebook runtime (no Spark cluster spin-up) — cost and startup latency are significantly lower. PySpark should not be used for workloads that DuckDB can handle.

---

## 7. CI/CD & FabricOps Framework

### 7.1 Overview

All CI/CD is based on **FabricOps framework** (https://github.com/gronnerup/FabricOps), which orchestrates `fabric-cicd` through Azure DevOps (ADO) or GitHub Actions pipelines.

### 7.2 Per-Tier CI/CD Strategy

| Tier | CI/CD Level | Mechanism |
|---|---|---|
| Small | **Prepared** — Git integration only | Workspaces connected to Git; deployments manual via Fabric UI |
| Medium | **Basic pipeline** | ADO/GitHub Actions: lint → unit test → deploy to prod (single step, approval required) |
| Large | **Full pipeline** | lint → unit test → deploy dev → integration test → approve → deploy prod |

### 7.3 Git Integration & Branching Strategy

All workspaces are connected to Git (Azure DevOps Repos or GitHub).

**Small tier:**
- Single `main` branch reflects production state
- Deployment triggered manually from `main`

**Medium & Large:**
- `main` reflects production; `develop` reflects development
- Feature branches: `feature/[component]/[description]`
- PRs from feature branches to `develop`; from `develop` to `main`

---

## 8. Reporting & Power BI

### 8.1 Semantic Layer Strategy

The Semantic layer lakehouse (`lh_[domain]_semantic`) pre-aggregates data for Direct Lake consumption. Semantic models connect via **Direct Lake** mode for near-real-time query performance.

### 8.2 Semantic Model Governance

- One semantic model per **subject area** (Finance, Sales, HR, etc.)
- Shared dimensions published from Semantic workspace
- Models owned by service principal, deployed via FabricOps
- Consistent naming convention for all measures

### 8.3 Power BI Organisational Apps

Reports distributed exclusively through **Organisational Apps**. Direct workspace access for end users is not granted.

### 8.4 Licensing Strategy

| User Type | Licence Required |
|---|---|
| Report consumer — capacity < F64 | **Power BI Pro** ($10/user/month) |
| Report consumer — capacity ≥ F64 | Free Fabric licence |
| Report author / BI creator | **Power BI Pro** |
| Fabric engineer (notebooks, pipelines) | Free Fabric licence |

---

## 9. Identity & Access Management

### 9.1 Workspace Identities vs. Service Principals

**Workspace Identity (WI)** — Preferred for within-Fabric operations:
- OneLake Shortcuts
- Data Pipelines
- Semantic Models
- Dataflows Gen2

**Service Principal (SPN)** — Required for:
- FabricOps / CI/CD pipelines
- Cross-workspace automation
- External service access
- Gateway connections
- Purview integration

### 9.2 Entra ID Group Architecture

Three-level hierarchy:
- **Level 1:** Platform Admin Groups (tenant administration)
- **Level 2:** Workspace Role Groups (Admin, Member, Contributor, Viewer)
- **Level 3:** App/Content Groups (Power BI App access, RLS)

### 9.3 Group Naming Convention

```
Pattern:  grp-fab-[scope]-[domain]-[role]-[env]

Examples:
  grp-fab-tenant-platform-admin
  grp-fab-workspace-fin-admin-prd
  grp-fab-sp-platform-prd
```

---

## 15. Naming Conventions

### 15.1 Organization Naming

- Lowercase, no spaces
- Example: `contoso`, `retailco`, `financeorg`

### 15.2 Workspace Naming

**Pattern:** `ws-{org}-{domain}-{component}-{env}`

**Components:**
- `core` — Shared config / utilities per domain
- `ingest` — Data in
- `store` — Medallion lakehouses
- `prepare` — Transforms between layers
- `orchestrate` — Master pipeline
- `model` — Semantic layer
- `present` — Reports / apps

**Environments:**
- `dev` — Development
- `tst` — Test
- `prd` — Production

**Examples:**
```
ws-contoso-fin-store-dev
ws-contoso-fin-store-prd
ws-contoso-risk-analytics-prd
```

### 15.3 Capacity Naming

**Pattern:** `cap-{org}-{purpose}-{region}-{instance}`

**Example:**
```
cap-contoso-analytics-weu-01
cap-contoso-engineering-uks-01
```

### 15.4 Item Naming

**Pattern:** `[TYPE]_[PURPOSE]_[freetext]`

**TYPE** (uppercase):
- `LH` — Lakehouse
- `NB` — Notebook
- `DP` — Data Pipeline
- `CJ` — Copy Job
- `SM` — Semantic Model
- `RP` — Report
- `WH` — Warehouse
- `VL` — Variable Library
- `EN` — Environment

**PURPOSE** (5 chars):
- `STORE` — Storage/Medallion layer
- `INGST` — Ingestion
- `TRNSF` — Transform
- `ORCHS` — Orchestration
- `ANLYZ` — Analytics
- `MONIT` — Monitoring
- `MAINT` — Maintenance
- `CNFGS` — Configuration

**freetext:**
- Lowercase with underscores
- Includes domain
- Descriptive

**Examples:**
```
LH_STORE_fin_raw
LH_STORE_fin_semantic
NB_INGST_fin_landing_loader
DP_ORCHS_fin_master
SM_ANLYZ_fin_financial
RP_ANLYZ_fin_overview
VL_CNFGS_fin_env
```

---

## 16. Scalability & Migration Path

### Tier Progression

**Small → Medium:**
- Add dev environment (new 3 workspaces)
- Implement basic CI/CD pipeline
- Add Purview for cataloguing

**Medium → Large:**
- Separate by business domain (dedicated workspace sets per domain)
- Multi-capacity architecture
- Advanced governance and monitoring

---

## Key Principles

1. **Medallion Architecture** — Clear data layer separation (landing, raw, clean, transformed, consolidated, semantic)
2. **Workspace Isolation** — Workspaces by component and environment, not by domain
3. **Service Principal Driven** — No dependency on named individuals for automation
4. **Git-Centric** — All code and configuration version-controlled
5. **Infrastructure as Code** — Bicep/PowerShell for repeatability
6. **Observability** — Centralized logging, monitoring, and alerting
7. **Security First** — PIM-enabled access, RLS/OLS, encryption at rest/transit

---

## Related Documentation

- **FabricOps Framework**: https://github.com/gronnerup/FabricOps
- **Fabric REST APIs**: https://learn.microsoft.com/en-us/rest/api/fabric/
- **Medallion Architecture**: https://learn.microsoft.com/en-us/azure/databricks/lakehouse/medallion-architecture
- **Fabric Best Practices**: https://learn.microsoft.com/en-us/fabric/

