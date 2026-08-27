# Fabric Auto - Getting Started

This guide walks through the complete workflow for the current Fabric Auto setup.

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

## 3. Authenticate

Sign in to Azure:

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

## 4. Verify the Existing Capacity

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

Each item has a name and Fabric type:

```yaml
- name: NB_INGST_fin_example_source
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

## 7. Validate the Repository

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

## 8. Preview the Provisioning Plan

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

## 9. Provision Workspaces and Items

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

## 10. Verify Provisioning

List Fabric workspaces:

```powershell
fab dir
```

Confirm that the expected development and production workspaces exist.

## 11. Initialize Bronze Metadata

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

## 12. Test Bronze Ingestion in Development

If you selected Notebook, run:

```text
NB_INGST_fin_example_source
```

If you selected Copy activity, run:

```text
DP_INGST_fin_landing_loader
```

Test only in the development workspace first.

## 13. Test Transformations

After Bronze ingestion succeeds, run the transformation notebooks in order:

```text
NB_TRNSF_fin_raw_to_base
NB_TRNSF_fin_base_to_enriched
```

Update generic fields such as `record_id`, `amount`, `updated_at`, and source paths to match the real source schema.

## 14. Optional Azure DevOps Integration

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

## 15. Optional Deployment Pipelines

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

## 16. Optional FabricOps Content Deployment

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

## Recommended First Run

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

## What Is Not Automatic Yet

The repository does not currently:

- Upload local `.ipynb` files into Fabric Notebook items during provisioning
- Create Azure DevOps connections
- Create Fabric deployment pipelines
- Assign Entra groups or workspace roles
- Infer source schemas
- Replace generic notebook paths and column names

Those are intentionally separate steps so you can review and approve them manually.
