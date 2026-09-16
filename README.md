# Fabric Platform — AI Provisioning Setup

An explicit, reviewable setup for Microsoft Fabric. You define every workspace
and lowercase item name in a YAML spec, preview the plan, and approve
provisioning from PowerShell.

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
    ├── frontend/               # Local workspace/item planning control panel
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

### Local Control Panel

Start the browser-based planning interface from PowerShell:

  .\scripts\start-frontend.ps1

Then open `http://localhost:8765`. The control panel is optional: it edits
workspace/item names, selects Notebook or Copy activity, previews the plan,
discovers Azure subscriptions and capacities, and downloads a JSON plan.
Terminal deployment remains the recommended path, and the browser never stores
credentials.

The setup form lets you select any combination of:

- Environments: `dev`, `tst`, and `prd`
- Domains: one or more comma-separated domain names
- Workspace types: `engineering`, `store`, and `analytics`

When `store` is selected, its lakehouses and the selected Bronze ingestion item
are included. The unselected Notebook or Copy activity alternative is omitted.

The local `scripts/control-panel.py` backend generates the initial names and
items from those choices. You can edit the generated names before downloading
the plan or running the PowerShell provisioning workflow.

Each workspace card has three different actions:

- **Remove item**: remove an item from the local browser plan without
  changing Fabric.
- **Remove from plan**: immediately remove the entire workspace from the local
  browser plan without changing Fabric.
- **Delete in Fabric**: permanently delete the workspace and all items inside
  it after typing the exact workspace name. This action is intentionally
  separate and destructive.

After `az login`, the form discovers subscriptions and existing succeeded
Fabric capacities through Azure CLI. Selecting a capacity updates the plan; it
does not create a capacity.

The frontend only discovers existing Fabric capacities. Capacity creation is
outside this application and must be handled separately through approved Azure
infrastructure procedures.

### Platform extensions

The control panel supports plan import/export, automatic validation, exact
dry-run command previews, and local deployment history. Completed deployments
are recorded under `.fabricflow/`, which is ignored by Git. A recorded
deployment can be rolled back only with explicit confirmation because rollback
deletes its workspaces.

The provisioning schema accepts `Lakehouse`, `Warehouse`, `Notebook`,
`DataPipeline`, `Dataflow`, `DataflowGen2`, `Eventstream`, `SemanticModel`,
`Report`, and `VariableLibrary` item types.

`fabric-platform.yaml` contains opt-in configuration sections for
`workspace_permissions` (Entra groups and Fabric roles), `key_vault` (secret
references only), `monitoring` (Log Analytics categories), `tenants` (tenant
and subscription targets), and `deployment_history`. These are planning and
configuration surfaces until the required Azure and Fabric permissions are
supplied. Credentials are never stored in the browser or YAML file.

The **Deploy to Fabric** button is optional. It requires browser confirmation
and invokes the local Fabric CLI through the backend. You can leave it unused
and deploy entirely from the terminal. Azure DevOps Git is a separate confirmed
action and uses the interactive Fabric authentication from the terminal; no PAT
or service-principal secret is sent to the browser.

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

To run the content phase immediately after all workspaces and Fabric item shells
are created, provide a FabricOps-compatible `solution/` directory and use:

  .\scripts\provision.ps1 --publish-content

The content phase is opt-in and always runs after the `fab create` operations.
Without `solution/`, the command stops before making any Fabric changes.

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
