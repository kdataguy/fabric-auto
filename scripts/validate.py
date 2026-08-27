from pathlib import Path
import json
import sys

import yaml


ROOT = Path(__file__).resolve().parent.parent
SPEC_PATH = ROOT / "fabric-platform.yaml"


def main():
    with SPEC_PATH.open(encoding="utf-8") as spec_file:
        spec = yaml.safe_load(spec_file)

    workspaces = spec.get("workspaces", [])
    if not workspaces:
        raise ValueError("No explicit workspaces are defined")

    names = set()
    notebook_count = 0
    for workspace in workspaces:
        workspace_name = workspace.get("name")
        if not workspace_name or workspace_name in names:
            raise ValueError(f"Missing or duplicate workspace name: {workspace_name}")
        names.add(workspace_name)

        for item in workspace.get("items", []):
            item_name = item.get("name")
            item_type = item.get("type")
            if not item_name or not item_type:
                raise ValueError(f"Every item needs name and type in {workspace_name}")
            if item_name != item_name.lower():
                raise ValueError(f"Item name must use lowercase letters: {item_name}")
            definition = item.get("definition")
            if definition:
                notebook_count += 1
                definition_path = ROOT / definition
                if not definition_path.is_file():
                    raise ValueError(f"Definition not found: {definition}")
                definition_json = json.loads(definition_path.read_text(encoding="utf-8"))
                if item_type == "Notebook":
                    notebook_language = definition_json.get("metadata", {}).get("language_info", {}).get("name")
                    if not notebook_language:
                        raise ValueError(f"{definition}: missing notebook language metadata")
                    for number, cell in enumerate(definition_json.get("cells", []), start=1):
                        cell_language = cell.get("metadata", {}).get("language")
                        if not cell_language and cell.get("cell_type") == "code" and notebook_language != "python":
                            raise ValueError(f"{definition}: cell {number} has no language metadata")

    print(f"Validated {len(workspaces)} explicitly named workspaces")
    print(f"Validated {notebook_count} notebook definitions")
    print(f"Git enabled: {spec.get('git', {}).get('enabled', False)}")
    print(f"Deployment pipelines enabled: {spec.get('deployment_pipelines', {}).get('enabled', False)}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, json.JSONDecodeError, yaml.YAMLError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
