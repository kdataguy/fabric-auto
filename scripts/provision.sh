#!/usr/bin/env bash
# ============================================================================
# provision.sh — generated from fabric-platform.yaml + CLAUDE.md
#
# org=contoso  capacity=cap-contoso-analytics-weu-01
# domains=[fin]  environments=[dev, prd]  model=medium 3-component
#
# Review before running. Nothing touches Fabric until you execute this.
#   bash scripts/provision.sh
# ============================================================================
set -euo pipefail

ORG="contoso"
CAPACITY="cap-contoso-analytics-weu-01"

# ----------------------------------------------------------------------------
# Phase 1 — Workspaces (all created before any items)
# ----------------------------------------------------------------------------

for ENV in dev prd; do
  for DOMAIN in fin; do
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace" -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace"       -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-analytics-${ENV}.Workspace"   -P capacityName="${CAPACITY}"
  done
done

# Platform-level workspace (no env suffix, not per-domain)
fab create "ws-${ORG}-platform-monitoring.Workspace" -P capacityName="${CAPACITY}"

# ----------------------------------------------------------------------------
# Phase 2 — Items (lakehouses created before notebooks/pipelines that attach)
# ----------------------------------------------------------------------------

for ENV in dev prd; do
  for DOMAIN in fin; do

    # engineering — shared config, ingestion, transforms, orchestration
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace/VL_CNFGS_${DOMAIN}_env.VariableLibrary"

    # store — medallion lakehouses (landing has no schema; raw+ have schemas)
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_landing.Lakehouse"
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_raw.Lakehouse"      -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_base.Lakehouse"     -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_enriched.Lakehouse" -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_curated.Lakehouse"  -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_semantic.Lakehouse" -P enableSchemas=true

    # ingest — source landing
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace/NB_INGST_${DOMAIN}_example_source.Notebook"
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace/DP_INGST_${DOMAIN}_landing_loader.DataPipeline"

    # engineering — transforms between layers
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace/NB_TRNSF_${DOMAIN}_raw_to_base.Notebook"
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace/NB_TRNSF_${DOMAIN}_base_to_enriched.Notebook"

    # engineering — master pipeline
    fab create "ws-${ORG}-${DOMAIN}-engineering-${ENV}.Workspace/DP_ORCHS_${DOMAIN}_master.DataPipeline"

    # analytics — semantic layer and reports
    fab create "ws-${ORG}-${DOMAIN}-analytics-${ENV}.Workspace/SM_ANLYZ_${DOMAIN}_financial.SemanticModel"

    fab create "ws-${ORG}-${DOMAIN}-analytics-${ENV}.Workspace/RP_ANLYZ_${DOMAIN}_overview.Report"

  done
done

# Platform-level items
fab create "ws-${ORG}-platform-monitoring.Workspace/LH_MONIT_platform_ops.Lakehouse" -P enableSchemas=true

echo "Provisioning complete."
