from pathlib import Path
import subprocess
import sys

import yaml


ROOT = Path(__file__).resolve().parent.parent
SPEC_PATH = ROOT / "fabric-platform.yaml"
FAB_PATH = ROOT / ".venv" / "Scripts" / "fab.exe"


def load_spec():
    with SPEC_PATH.open(encoding="utf-8") as spec_file:
        spec = yaml.safe_load(spec_file)
    workspaces = spec.get("workspaces", [])
    if not workspaces:
        raise ValueError("fabric-platform.yaml must contain an explicit workspaces list")
    return spec, workspaces


def validate(spec, workspaces):
    capacity = spec.get("capacity")
    if not capacity or capacity.startswith("<"):
        raise ValueError("A real existing capacity is required")

    workspace_names = set()
    for workspace in workspaces:
        name = workspace.get("name")
        if not name or name in workspace_names:
            raise ValueError(f"Workspace name is missing or duplicated: {name}")
        workspace_names.add(name)
        for item in workspace.get("items", []):
            if not item.get("name") or not item.get("type"):
                raise ValueError(f"Every item needs name and type in workspace {name}")
            definition = item.get("definition")
            if definition and not (ROOT / definition).is_file():
                raise ValueError(f"Notebook definition not found: {definition}")

    bronze = spec.get("metadata_bronze", {})
    if bronze.get("mode") not in {"prompt", "notebook", "copy_activity"}:
        raise ValueError("metadata_bronze.mode must be prompt, notebook, or copy_activity")
    for parameter in bronze.get("copy_activity", {}).get("parameters", []):
        if not parameter or not parameter.replace("_", "").isalnum():
            raise ValueError(f"Invalid Copy activity parameter: {parameter}")


def build_operations(spec, workspaces, ingestion_mode):
    operations = []
    for workspace in workspaces:
        capacity = workspace.get("capacity", spec["capacity"])
        operations.append((workspace["name"] + ".Workspace", ["-P", f"capacityName={capacity}"]))

    lakehouse_operations = []
    item_operations = []
    for workspace in workspaces:
        workspace_path = workspace["name"] + ".Workspace"
        for item in workspace.get("items", []):
            item_method = item.get("ingestion_method")
            if item_method and item_method != ingestion_mode:
                continue
            path = f"{workspace_path}/{item['name']}.{item['type']}"
            params = []
            if item.get("type") == "Lakehouse" and item.get("enableSchemas"):
                params = ["-P", "enableSchemas=true"]
            if item.get("type") == "Lakehouse":
                lakehouse_operations.append((path, params))
            else:
                item_operations.append((path, params))
    return operations + lakehouse_operations + item_operations


def select_ingestion_mode(spec):
    for argument in sys.argv:
        if argument.startswith("--ingestion-mode="):
            mode = argument.split("=", 1)[1]
            if mode not in {"notebook", "copy_activity"}:
                raise ValueError("--ingestion-mode must be notebook or copy_activity")
            return mode

    configured_mode = spec.get("metadata_bronze", {}).get("mode", "prompt")
    if configured_mode != "prompt":
        return configured_mode

    print("Bronze ingestion options:")
    print("  1. notebook - flexible custom PySpark logic")
    print("  2. copy_activity - metadata-driven source-to-Bronze movement")
    choice = input("Choose an ingestion method [1/2]: ").strip()
    if choice == "1":
        return "notebook"
    if choice == "2":
        return "copy_activity"
    raise ValueError("Choose 1 for notebook or 2 for copy_activity")


def run_fab(path, params):
    command = [str(FAB_PATH), "create", path, *params]
    print("Running:", " ".join(command))
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        raise RuntimeError(f"Fabric CLI failed with exit code {result.returncode}: {path}")


def workspace_environment(name):
    for environment in ("dev", "tst", "prd"):
        if name.endswith(f"-{environment}"):
            return environment
    return "dev"


def publish_content(workspaces):
    publisher = ROOT / "scripts" / "deploy-content.py"
    repository = ROOT / "solution"
    if not repository.is_dir():
        raise FileNotFoundError(
            f"Content publishing requires a FabricOps solution directory: {repository}"
        )

    for workspace in workspaces:
        command = [
            sys.executable,
            str(publisher),
            "--repository-directory",
            "solution",
            "--workspace-name",
            workspace["name"],
            "--environment",
            workspace_environment(workspace["name"]),
            "--yes",
        ]
        print("Publishing content:", " ".join(command))
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode:
            raise RuntimeError(f"Content publishing failed: {workspace['name']}")


def main():
    if not FAB_PATH.is_file():
        raise FileNotFoundError(f"Fabric CLI not found at {FAB_PATH}")

    spec, workspaces = load_spec()
    validate(spec, workspaces)
    ingestion_mode = select_ingestion_mode(spec)
    publish_requested = "--publish-content" in sys.argv
    if publish_requested and not (ROOT / "solution").is_dir():
        raise FileNotFoundError(
            f"Content publishing requires a FabricOps solution directory: {ROOT / 'solution'}"
        )
    operations = build_operations(spec, workspaces, ingestion_mode)

    print(f"Selected bronze ingestion: {ingestion_mode}")
    print("Provisioning plan:")
    for path, params in operations:
        suffix = " " + " ".join(params) if params else ""
        print(f"  fab create {path}{suffix}")
    print(f"\n{len(workspaces)} workspaces and {len(operations) - len(workspaces)} items will be processed.")

    if "--preview" in sys.argv or "-Preview" in sys.argv:
        if publish_requested:
            print("Content publishing phase: after all Fabric workspaces and items")
        return
    if "--yes" not in sys.argv and "-Yes" not in sys.argv:
        answer = input("Proceed with this provisioning plan? [y/N] ").strip().lower()
        if answer != "y":
            print("Cancelled. No Fabric resources were changed.")
            return

    for path, params in operations:
        run_fab(path, params)
    if publish_requested:
        publish_content(workspaces)
    print("Provisioning complete.")


if __name__ == "__main__":
    try:
        main()
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
