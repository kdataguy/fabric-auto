# CLAUDE.md — Fabric Platform AI Context

Persistent context for provisioning our Microsoft Fabric platform. Loaded
automatically by Claude Code / Copilot CLI. Encodes our conventions so they
never need re-explaining. Paired with `fabric-platform.yaml` (the spec) and
the `fab` CLI (the tool).

## Your role

Generate `fab` CLI scripts that create Fabric **workspaces and the items
inside them**, from `fabric-platform.yaml`. Write the script to
`scripts/provision.sh` for review. Only execute it when the user explicitly
says to run it.

## Source of truth

- `fabric-platform.yaml` — WHAT to build (org, domains, environments, capacity, components, items).
- This file — HOW to name and build it (conventions + rules below).

## Workspace naming (spec §15.2)

    ws-{org}-{domain}-{component}-{env}

- `component`: core | ingest | store | prepare | orchestrate | model | present
- `env`: dev | tst | prd
- Platform monitoring workspace: `ws-{org}-platform-monitoring` (no env suffix).
- **Medium tier** consolidates the seven into three: fold ingest+prepare+orchestrate+core
  into `engineering`, and model+present into `analytics`, keeping `store`.

## Item naming (spec §15.4)

    [TYPE]_[PURPOSE]_[freetext]        e.g. LH_STORE_fin_raw, DP_ORCHS_fin_master

- TYPE (uppercase): LH lakehouse, NB notebook, DP data pipeline, CJ copy job,
  SM semantic model, RP report, WH warehouse, VL variable library, EN environment.
- PURPOSE (5 chars): STORE, INGST, TRNSF, ORCHS, ANLYZ, MONIT, MAINT, CNFGS.
- freetext: lowercase_with_underscores, includes the domain.

## Medallion lakehouses (spec §5)

- In the `store` workspace: `LH_STORE_{domain}_{layer}` for each layer:
  landing, raw, base, enriched, curated, semantic.
- `landing` is files-only — create WITHOUT `-P enableSchemas=true`.
- raw and above — create WITH `-P enableSchemas=true`.

## Generation rules

- Non-interactive mode: `fab config set mode command_line`; every path fully
  qualified with its dot-suffix (`.Workspace`, `.Lakehouse`, `.Notebook`, ...).
- Create all workspaces before any items.
- Assign capacity inline at workspace creation: `-P capacityName={capacity}`.
- Create a lakehouse before any notebook/pipeline that attaches to it.
- Expand `{domain}` / `{env}` templates: one full set per domain, per environment.

## Guardrails — never do these

- Never create the **capacity** itself (Azure resource), **Entra groups**,
  **gateways**, **Purview**, **private endpoints**, or **tenant settings**.
  These are out of `fab` scope. If the spec implies one, stop and tell the user.
- The `capacity` named in the spec must already exist — do not attempt to create it.
- Never run destructive `fab` commands (delete/remove) without explicit,
  per-action confirmation from the user.
- Never invent workspace or item names — always derive them from the rules above.

## Auth (before running)

    az login
    fab auth login          # or: fab auth login -u <sp_id> -p <secret> --tenant <tenant>
