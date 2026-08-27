# Fabric Platform — AI Provisioning Setup

An "explain once" setup: the AI holds your Fabric conventions permanently and
generates `fab` CLI scripts to provision workspaces and items from a spec.

## How it works

    fabric-platform.yaml   →   [ Claude Code reads it + CLAUDE.md ]   →   scripts/provision.sh   →   you run it
      (what to build)                (your conventions)                    (fab commands)         (creates Fabric)

You never re-explain your naming, tiers, or layers — they live in `CLAUDE.md`.
You state intent ("provision the fin domain"); the AI produces the script; you
review and run it.

## Folder layout

    fabric-platform/
    ├── CLAUDE.md              # AI context — conventions & rules (loaded automatically)
    ├── fabric-platform.yaml   # declarative spec — what to build
    ├── scripts/
    │   └── provision.sh       # generated output — review before running
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

1. Edit `fabric-platform.yaml` — set `org`, `capacity`, `domains`, `environments`, items.
2. Open this folder in Claude Code (or Copilot CLI).
3. Ask: *"Generate the provisioning script from the spec."*
4. Review `scripts/provision.sh`.
5. Run it:  `bash scripts/provision.sh`

## Decisions still open (set these in the spec / context)

- **Workspace model** — full 7-component, or Medium 3-type consolidation.
- **Item depth** — lakehouses only, the starter items, or full per-source expansion.
- **Access** — whether provisioning should also assign Entra groups as workspace
  roles (the groups must pre-exist in Entra).
- **Capacity split** — one capacity for all, or different capacities per component.
