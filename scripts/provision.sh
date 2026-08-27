#!/usr/bin/env bash
# ============================================================================
# provision.sh — generated from fabric-platform.yaml + CLAUDE.md
#
# org=contoso  capacity=cap-contoso-analytics-weu-01
# domains=[fin]  environments=[dev, prd]  model=full 7-component
#
# Review before running. Nothing touches Fabric until you execute this.
#   bash scripts/provision.sh
# ============================================================================
set -euo pipefail

ORG="contoso"
CAPACITY="cap-contoso-analytics-weu-01"

fab config set mode command_line

# ----------------------------------------------------------------------------
# Phase 1 — Workspaces (all created before any items)
# ----------------------------------------------------------------------------

for ENV in dev prd; do
  for DOMAIN in fin; do
    fab create "ws-${ORG}-${DOMAIN}-core-${ENV}.Workspace"        -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-ingest-${ENV}.Workspace"      -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace"       -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-prepare-${ENV}.Workspace"     -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-orchestrate-${ENV}.Workspace" -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-model-${ENV}.Workspace"       -P capacityName="${CAPACITY}"
    fab create "ws-${ORG}-${DOMAIN}-present-${ENV}.Workspace"     -P capacityName="${CAPACITY}"
  done
done

# Platform-level workspace (no env suffix, not per-domain)
fab create "ws-${ORG}-platform-monitoring.Workspace" -P capacityName="${CAPACITY}"

# ----------------------------------------------------------------------------
# Phase 2 — Items (lakehouses created before notebooks/pipelines that attach)
# ----------------------------------------------------------------------------

for ENV in dev prd; do
  for DOMAIN in fin; do

    # core — shared config
    fab create "ws-${ORG}-${DOMAIN}-core-${ENV}.Workspace/VL_CNFGS_${DOMAIN}_env.VariableLibrary"

    # store — medallion lakehouses (landing has no schema; raw+ have schemas)
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_landing.Lakehouse"
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_raw.Lakehouse"      -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_base.Lakehouse"     -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_enriched.Lakehouse" -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_curated.Lakehouse"  -P enableSchemas=true
    fab create "ws-${ORG}-${DOMAIN}-store-${ENV}.Workspace/LH_STORE_${DOMAIN}_semantic.Lakehouse" -P enableSchemas=true

    # ingest — source landing
    fab create "ws-${ORG}-${DOMAIN}-ingest-${ENV}.Workspace/NB_INGST_${DOMAIN}_example_source.Notebook"
    fab create "ws-${ORG}-${DOMAIN}-ingest-${ENV}.Workspace/DP_INGST_${DOMAIN}_landing_loader.DataPipeline"

    # prepare — transforms between layers
    fab create "ws-${ORG}-${DOMAIN}-prepare-${ENV}.Workspace/NB_TRNSF_${DOMAIN}_raw_to_base.Notebook"
    fab create "ws-${ORG}-${DOMAIN}-prepare-${ENV}.Workspace/NB_TRNSF_${DOMAIN}_base_to_enriched.Notebook"

    # orchestrate — master pipeline
    fab create "ws-${ORG}-${DOMAIN}-orchestrate-${ENV}.Workspace/DP_ORCHS_${DOMAIN}_master.DataPipeline"

    # model — semantic layer
    fab create "ws-${ORG}-${DOMAIN}-model-${ENV}.Workspace/SM_ANLYZ_${DOMAIN}_financial.SemanticModel"

    # present — reports
    fab create "ws-${ORG}-${DOMAIN}-present-${ENV}.Workspace/RP_ANLYZ_${DOMAIN}_overview.Report"

  done
done

# Platform-level items
fab create "ws-${ORG}-platform-monitoring.Workspace/LH_MONIT_platform_ops.Lakehouse" -P enableSchemas=true

echo "Provisioning complete."
