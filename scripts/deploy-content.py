"""Optional FabricOps/fabric-cicd content deployment entry point.

This script is intentionally separate from workspace provisioning. It expects a
FabricOps-compatible repository directory containing item folders and uses the
Azure CLI identity created by `az login`.
"""

import argparse
from pathlib import Path

from azure.identity import AzureCliCredential
from fabric_cicd import FabricWorkspace, publish_all_items


ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description="Publish Fabric item definitions")
    parser.add_argument("--repository-directory", default="solution", type=Path)
    parser.add_argument("--workspace-id")
    parser.add_argument("--workspace-name")
    parser.add_argument("--environment", default="dev")
    parser.add_argument("--yes", action="store_true", help="Skip the publish confirmation")
    args = parser.parse_args()

    repository = (ROOT / args.repository_directory).resolve()
    if not repository.is_dir():
        raise SystemExit(f"Repository directory not found: {repository}")
    if not args.workspace_id and not args.workspace_name:
        raise SystemExit("Provide --workspace-id or --workspace-name")

    print(f"Repository: {repository}")
    print(f"Target: {args.workspace_id or args.workspace_name}")
    print(f"Environment: {args.environment}")
    if not args.yes and input("Publish these item definitions? [y/N] ").strip().lower() != "y":
        print("Cancelled. No Fabric items were changed.")
        return

    workspace = FabricWorkspace(
        repository_directory=str(repository),
        token_credential=AzureCliCredential(),
        workspace_id=args.workspace_id,
        workspace_name=args.workspace_name,
        environment=args.environment,
    )
    result = publish_all_items(workspace)
    print(result or "Content publish completed.")


if __name__ == "__main__":
    main()
