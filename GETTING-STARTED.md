# Fabric Auto - Getting Started

This guide walks through the complete workflow for the current Fabric Auto setup.
The supported deployment path is terminal-first. The frontend is optional and
can be used to design and review a plan before deploying from the terminal.

The design is intentionally hybrid:

- You choose workspace and item names in `fabric-platform.yaml`.
- PowerShell shows the provisioning plan before making changes.
- You choose Notebook or metadata-driven Copy activity for Bronze ingestion.
- FabricOps/fabric-cicd, Azure DevOps, and deployment pipelines are optional later steps.

## 1. Open the Project

Open PowerShell and move to the repository:

```powershell
Set-Location "C:\Users\sekhyou001\Downloads\Fabric Auto"
```

## 2. Activate the Python Environment

The project uses a local Python virtual environment:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

python --version
fab --version
```

Expected Fabric CLI version is currently `1.7.0` or newer.

## 3. Log In Through the Terminal

Sign in to Azure first. This is required before capacity discovery and frontend
capacity selection:

```powershell
az login
```

Authenticate the Fabric CLI:

```powershell
fab auth login
```

Choose:

```text
Interactive with a web browser
```

Verify Fabric access:

```powershell
fab dir
```

Do not start the frontend before completing `az login`. The frontend uses the
Azure CLI session already established in this terminal.

## 4. Verify and Select the Existing Capacity

The capacity must already exist. This repository does not create capacities.

```powershell
az resource list `
  --resource-type "Microsoft.Fabric/capacities" `
  --query "[].{Name:name,ResourceGroup:resourceGroup,Region:location,State:provisioningState}" `
  --output table
```

Confirm that the capacity configured in `fabric-platform.yaml` appears with state `Succeeded`.

Current example:

```yaml
capacity: fadev01
```

The frontend can show this same list after you select a subscription, but it
does not create capacities.

## 5. Choose Workspace and Item Names

Edit [fabric-platform.yaml](fabric-platform.yaml).

All names are explicit. The runner does not generate or rename them.

The current Medium setup contains six workspaces for the `fin` domain:

```text
engineering-dev
store-dev
analytics-dev
engineering-prd
store-prd
analytics-prd
```

You can edit the `workspaces` section to change names, add items, or remove items.

Each item has a lowercase name and a Fabric type:

```yaml
- name: nb_ingst_fin_example_source
  type: Notebook
  definition: notebooks/NB_INGST_fin_example_source.ipynb
```

## 6. Select the Bronze Ingestion Method

The YAML contains:

```yaml
metadata_bronze:
  mode: prompt
```

When `mode` is `prompt`, provisioning asks you to choose:

```text
1. notebook
2. copy_activity
```

### Notebook

Choose Notebook when you need custom PySpark logic, complex transformations, or special error handling.

Notebook definition:

```text
notebooks/NB_INGST_fin_example_source.ipynb
```

### Copy activity

Choose Copy activity for straightforward source-to-Bronze movement. It is usually simpler and cheaper for files or SQL tables.

The parameterized pipeline definition is:

```text
pipelines/DP_INGST_fin_landing_loader.json
```

Its parameters are:

```text
SourceObject
TargetTable
LoadType
WatermarkColumn
```

The pipeline reads metadata from:

```text
raw._sys_ingestion_config
raw._sys_watermark
```

## 7. Optional Frontend Planning

Start the frontend only after completing the terminal login steps:

```powershell
.\scripts\start-frontend.ps1
```

Open `http://localhost:8765`. Use it to select the Azure subscription and
capacity, choose domains, environments, workspace types, and Bronze mode, then
review or edit the generated names and items.

The frontend is optional. It is not required for terminal deployment. Its
**Save locally** action stores the current draft in browser storage, and
**Download plan** creates a JSON export in your browser Downloads folder. These
actions do not update `fabric-platform.yaml`.

For the simplest and most controlled workflow, copy the final names into
`fabric-platform.yaml` and deploy with the terminal commands below.

## 8. Validate the Repository

Run validation before provisioning:

```powershell
python scripts\validate.py
```

This checks:

- Explicit workspace names
- Duplicate workspace names
- Item names and types
- Notebook definition files
- Notebook JSON structure
- Copy activity JSON
- Bronze ingestion mode
- Required Copy activity parameters

## 9. Preview the Provisioning Plan

Preview without changing Fabric:

```powershell
.\scripts\provision.ps1 -Preview
```

To preview a specific Bronze option without being prompted:

```powershell
.\scripts\provision.ps1 -Preview --ingestion-mode=notebook
.\scripts\provision.ps1 -Preview --ingestion-mode=copy_activity
```

Review every workspace and item name in the output.

## 10. Provision Workspaces and Items

Run the provisioning script only after reviewing the preview:

```powershell
.\scripts\provision.ps1
```

Choose the Bronze method when prompted, then confirm with `y`.

The script creates:

1. All explicitly named workspaces
2. All lakehouses
3. All other configured items

Lakehouses are created before dependent notebooks and pipelines.

To skip the confirmation prompt for a deliberate automated run:

```powershell
.\scripts\provision.ps1 --ingestion-mode=copy_activity -Yes
```

Use this only when the YAML has already been reviewed.

## 11. Verify Provisioning

List Fabric workspaces:

```powershell
fab dir
```

Confirm that the expected development and production workspaces exist.

## 12. Initialize Bronze Metadata

Open the `NB_CNFGS_fin_initialize_metadata` notebook in the development engineering workspace and run it once.

It creates the metadata tables:

```text
raw._sys_ingestion_config
raw._sys_run_log
```

The architecture also reserves:

```text
raw._sys_source_registry
raw._sys_watermark
```

Edit the ingestion configuration to match the real source:

```text
source_name
source_format
source_path
target_table
load_type
watermark_column
enabled
```

Do not use the example values unchanged unless they match your source.

## 13. Test Bronze Ingestion in Development

If you selected Notebook, run:

```text
nb_ingst_fin_example_source
```

If you selected Copy activity, run:

```text
DP_INGST_fin_landing_loader
```

Test only in the development workspace first.

## 14. Test Transformations

After Bronze ingestion succeeds, run the transformation notebooks in order:

```text
nb_trnsf_fin_raw_to_base
nb_trnsf_fin_base_to_enriched
```

Update generic fields such as `record_id`, `amount`, `updated_at`, and source paths to match the real source schema.

## 15. Optional Azure DevOps Integration

Keep this disabled until development testing succeeds:

```yaml
git:
  enabled: false
```

When ready, fill in the real values:

```yaml
git:
  enabled: true
  provider: azure_devops
  organization: YOUR_ADO_ORGANIZATION
  project: YOUR_ADO_PROJECT
  repository: YOUR_ADO_REPOSITORY
  branch: develop
```

Never store a PAT, client secret, certificate, or password in this repository.

Use this branch strategy:

```text
develop -> development workspaces
main    -> production workspaces
```

The Azure DevOps validation pipeline is:

```text
.azure-pipelines/validate-fabric.yml
```

## 16. Optional Deployment Pipelines

Fabric deployment pipelines are also disabled by default:

```yaml
deployment_pipelines:
  enabled: false
```

Create three separate dev-to-production pipelines because each pipeline stage can contain only one workspace:

```text
Engineering: engineering-dev -> engineering-prd
Store:       store-dev       -> store-prd
Analytics:   analytics-dev   -> analytics-prd
```

Enable this only after the development workspaces and items are working:

```yaml
deployment_pipelines:
  enabled: true
```

Deployment rules and parameter rules should be reviewed manually in the Fabric portal.

## 17. Optional FabricOps Content Deployment

The optional publisher is:

```text
scripts/deploy-content.py
```

It requires a FabricOps-compatible `solution/` directory. The local `notebooks/` directory contains notebook definitions, but it is not automatically converted into the complete FabricOps solution structure.

Run it only after the target workspace exists and the content repository is prepared:

```powershell
python scripts\deploy-content.py `
  --workspace-name ws-contoso-fin-engineering-dev
```

The script asks for confirmation before publishing.

## Recommended Terminal-First Run

Use this order:

```powershell
Set-Location "C:\Users\sekhyou001\Downloads\Fabric Auto"
.\.venv\Scripts\Activate.ps1
az login
fab auth login
fab dir
python scripts\validate.py
.\scripts\provision.ps1 -Preview
.\scripts\provision.ps1
```

Choose the Bronze method interactively and test everything in `dev` before enabling Azure DevOps or production deployment automation.

## What Is Not Required for Terminal Deployment

The following are optional and can remain unused:

- `frontend/` and `scripts/control-panel.py`
- `.azure-pipelines/validate-fabric.yml`
- `scripts/deploy-content.py`
- Azure DevOps Git integration
- Fabric deployment pipelines
- The nested `skills-for-fabric/` reference library

The terminal-only deployment requires the local virtual environment, Azure CLI,
Fabric CLI, `fabric-platform.yaml`, `scripts/validate.py`, and
`scripts/provision.ps1`.

## What Is Not Automatic Yet

The repository does not currently:

- Upload local `.ipynb` files into Fabric Notebook items during provisioning
- Create Azure DevOps connections
- Create Fabric deployment pipelines
- Assign Entra groups or workspace roles
- Infer source schemas
- Replace generic notebook paths and column names

Those are intentionally separate steps so you can review and approve them manually.

## Frontend Control Panel

After `az login`, start the local control panel:

```powershell
.\scripts\start-frontend.ps1
```

Open `http://localhost:8765`. The panel discovers Azure subscriptions and
existing succeeded Fabric capacities, then lets you select environments,
domains, workspace types, and Bronze ingestion mode.

You can edit generated workspace names, add or remove items, and review the
plan. **Deploy to Fabric** requires a browser confirmation before the backend
invokes the Fabric CLI. Azure DevOps Git uses a separate confirmation and never
places PATs or service-principal secrets in the browser.

The panel is a local control surface. It does not write the plan back to
`fabric-platform.yaml`; keep the YAML updated when you want the design stored
in Git. Deployment pipelines remain a separate manual ALM operation.

### Deleting a Workspace

Use **Remove from plan** when you only want to change the local draft. Use
**Delete in Fabric** only when you intend to permanently remove the workspace
and every item inside it. The panel requires you to type the exact workspace
name before calling `fab del`.

## Frontend and Backend Explained

The local control panel has three layers:

```text
Browser frontend
  -> local control-panel.py API
  -> approved PowerShell/Python provisioning runner
  -> Fabric CLI
```

### Frontend

The files in `frontend/` provide the user interface. The browser lets you choose
environments, domains, workspace types, and Bronze ingestion mode. It also lets
you edit generated workspace names, remove items, add items, and review the
commands that would be run.

The browser does not have Fabric credentials and does not call Fabric directly.

### Backend

`scripts/control-panel.py` is a small local Python HTTP server. Its `/api/plan`
endpoint receives your selections and returns a generated plan. It centralizes
the starter item rules so the browser does not need to know how to construct
every workspace and item.

The backend currently generates plans only. It does not execute `fab`, write
`fabric-platform.yaml`, or provision Fabric resources.

### Save Locally

The **Save locally** button uses browser `localStorage`. This means:

- The current plan is saved only in this browser profile on this computer.
- It survives a page refresh.
- It is not committed to Git.
- It is not written to `fabric-platform.yaml`.
- Clearing browser site data removes it.

Use **Download plan** when you want a portable file. That button creates
`fabric-auto-plan.json` in the browser's normal Downloads location. It is a
frontend plan export, not a Fabric API payload and not automatically consumable
by `provision.py`.

### Current Hybrid Handoff

The current safe workflow is:

1. Use the frontend to design and review a plan.
2. Download the JSON or copy the chosen names into `fabric-platform.yaml`.
3. Run `python scripts/validate.py`.
4. Run `./scripts/provision.ps1 -Preview`.
5. Approve the PowerShell prompt to call `fab`.

This is hybrid because the frontend handles planning while the reviewed local
runner handles deployment. It is intentionally not a one-click deployment.

### Full Frontend-to-Backend Version

The next evolution would add these backend endpoints:

```text
POST /api/plan       Generate a plan from selections
POST /api/save-spec  Convert the approved plan to YAML on disk
POST /api/validate   Run the repository validator
POST /api/provision  Ask for explicit approval, then invoke provision.py
GET  /api/status     Return the latest operation log
```

The backend should remain local or run in a protected service. It must keep
Fabric credentials server-side, require an explicit confirmation before
`/api/provision`, log the exact plan, and never accept arbitrary shell commands
from the browser.
