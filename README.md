# Fabric Platform — AI Provisioning Setup

An explicit, reviewable setup for Microsoft Fabric. You define every workspace
and item name in a YAML spec, preview the plan, and approve provisioning from
PowerShell.

## How it works

    fabric-platform.yaml   →   [ validation + preview ]   →   scripts/provision.ps1   →   you approve and run it
      (what to build)                (your conventions)                    (fab commands)         (creates Fabric)

You control the names in `fabric-platform.yaml`. The provisioning runner does
not invent or expand names. Content deployment, Git integration, and deployment
pipelines are separate optional stages.

## Folder layout

    fabric-platform/
    ├── CLAUDE.md              # AI context — conventions & rules (loaded automatically)
    ├── fabric-platform.yaml   # declarative spec — what to build
    ├── scripts/
    │   ├── provision.ps1      # PowerShell provisioning entry point
    │   ├── provision.py       # YAML-driven preview/confirmation runner
    │   ├── deploy-content.py  # Optional fabric-cicd content publisher
    │   └── validate.py        # Local/CI validation
    ├── notebooks/             # Fabric-compatible .ipynb definitions
    ├── .azure-pipelines/      # Optional Azure DevOps validation pipeline
    └── skills-for-fabric/     # optional: Microsoft's operational fab/az skills (git clone)

## Prerequisites

- Python + Fabric CLI:  `pip install ms-fabric-cli`
- Azure CLI:  `az login`
- Fabric auth:  `fab auth login`
- An existing Fabric **capacity** (name goes in the spec; created via `az`/Bicep, not here).
- Your identity must have permission to **create workspaces** and **assign that capacity**.
  (Per the architecture doc, workspace creation is restricted to a platform-admin group —
  if provisioning fails with a permissions error, that's the cause.)

## Optional — layer in Microsoft's Fabric skills

For the low-level "how to operate Fabric" operations (git integration, variable
libraries, item definitions), clone Microsoft's open-source skills next to this:

    git clone https://github.com/microsoft/skills-for-fabric.git

Its own `CLAUDE.md` and skills load alongside yours. Yours defines *your*
conventions; theirs defines *how* to drive Fabric. They complement, not conflict.

## Usage

1. Edit `fabric-platform.yaml` — choose workspace and item names directly.
2. Validate the repository: `python scripts/validate.py`.
3. Preview the plan: `./scripts/provision.ps1 -Preview`.
4. Select Notebook or Copy activity and confirm provisioning.
5. Test content in the development workspace before enabling ALM.

Before provisioning, bronze ingestion is selected interactively:

- `1` — Notebook: flexible PySpark logic for complex transformations.
- `2` — Copy activity: metadata-driven source-to-Bronze movement.

The Copy activity option uses `SourceObject`, `TargetTable`, `LoadType`, and
`WatermarkColumn` pipeline parameters. The source registry and watermark tables
control which source objects are active. To select without a prompt:

  .\scripts\provision.ps1 -Preview --ingestion-mode=copy_activity

The metadata bootstrap notebook is:

  notebooks/NB_CNFGS_fin_initialize_metadata.ipynb

Run it once in the development engineering workspace before running the
metadata-driven ingestion flow.

For a FabricOps-style content repository, publish separately after provisioning:

  .\.venv\Scripts\python.exe scripts\deploy-content.py --workspace-name ws-contoso-fin-engineering-dev

The content publisher requires a `solution/` directory in FabricOps item format.
The local `notebooks/` files remain the source definitions until they are placed
in that structure or uploaded through the Fabric Notebook definition API.

Azure DevOps validation is provided by `.azure-pipelines/validate-fabric.yml`.
Deployment pipelines remain opt-in and should be enabled only after dev content
has been tested and the production workspace names are confirmed.

## Workflow Boundaries

The repository intentionally separates operations:

1. `provision.ps1` creates explicitly named workspaces and items after approval.
2. Notebook or Copy activity content is tested in development.
3. Azure DevOps Git is connected separately at the workspace level.
4. Three deployment pipelines promote engineering, store, and analytics from
  development to production.

No Git connection or production promotion occurs during workspace provisioning.

The repository includes starter notebook definitions for the `fin` domain:

- `NB_INGST_fin_example_source` — JSON ingestion to the raw layer
- `NB_TRNSF_fin_raw_to_base` — validation and deduplication
- `NB_TRNSF_fin_base_to_enriched` — finance-domain enrichment

These notebooks use generic paths and column names. Validate them against the
actual source schema in the development workspace before promoting them.

## Decisions still open (set these in the spec / context)

- **Workspace model** — Medium 3-type consolidation: engineering, store, and analytics
  across dev and prd (6 workspaces per domain).
- **Item depth** — lakehouses only, the starter items, or full per-source expansion.
- **Access** — whether provisioning should also assign Entra groups as workspace
  roles (the groups must pre-exist in Entra).
- **Capacity split** — one capacity for all, or different capacities per component.
- **Azure DevOps** — fill in the `git` section of `fabric-platform.yaml`, then
  connect each workspace using the Fabric Git integration.
- **Deployment pipelines** — create one dev-to-prd pipeline for each of the
  `engineering`, `store`, and `analytics` workspace types.
