from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import uuid
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
FAB = ROOT / ".venv" / "Scripts" / "fab.exe"
AZ = shutil.which("az.cmd") or shutil.which("az") or str(Path("C:\\Program Files\\Microsoft SDKs\\Azure\\CLI2\\wbin\\az.cmd"))
JOBS = {}


def run_command(command):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"Command failed: {' '.join(command)}")
    return json.loads(result.stdout or "[]")


def azure_subscriptions():
    if not Path(AZ).is_file():
        raise RuntimeError("Azure CLI was not found. Restart the control panel after installing Azure CLI.")
    return run_command([AZ, "account", "list", "--query", "[].{id:id,name:name,state:state}", "-o", "json"])


def azure_capacities(subscription_id):
    if not subscription_id:
        raise ValueError("A subscription is required")
    return run_command([
        AZ, "resource", "list", "--subscription", subscription_id,
        "--resource-type", "Microsoft.Fabric/capacities",
        "--query", "[].{name:name,resourceGroup:resourceGroup,region:location,sku:sku,state:provisioningState}",
        "-o", "json",
    ])


def items_for(component, domain, mode):
    if component == "engineering":
        notebook_definitions = domain == "fin"
        items = [
            {"name": f"vl_cnfgs_{domain}_env", "type": "VariableLibrary"},
            {"name": f"nb_trnsf_{domain}_raw_to_base", "type": "Notebook"},
            {"name": f"nb_trnsf_{domain}_base_to_enriched", "type": "Notebook"},
            {"name": f"nb_cnfgs_{domain}_initialize_metadata", "type": "Notebook"},
            {"name": f"dp_orchs_{domain}_master", "type": "DataPipeline"},
        ]
        if mode == "notebook":
            ingestion_item = {"name": f"nb_ingst_{domain}_example_source", "type": "Notebook", "ingestion_method": "notebook"}
            if notebook_definitions:
                ingestion_item["definition"] = f"notebooks/NB_INGST_{domain}_example_source.ipynb"
            items.insert(1, ingestion_item)
        else:
            ingestion_item = {"name": f"dp_ingst_{domain}_landing_loader", "type": "DataPipeline", "ingestion_method": "copy_activity"}
            if notebook_definitions:
                ingestion_item["definition"] = f"pipelines/DP_INGST_{domain}_landing_loader.json"
            items.insert(1, ingestion_item)
        return items
    if component == "store":
        return [{"name": f"lh_store_{domain}_{layer}", "type": "Lakehouse", "enableSchemas": layer != "landing"} for layer in ["landing", "raw", "base", "enriched", "curated", "semantic"]]
    if component == "analytics":
        return [
            {"name": f"sm_anlyz_{domain}_financial", "type": "SemanticModel"},
            {"name": f"rp_anlyz_{domain}_overview", "type": "Report"},
        ]
    return []


def build_plan(payload):
    org = str(payload.get("org", "")).strip().lower()
    capacity = str(payload.get("capacity", "")).strip()
    domains = [str(value).strip().lower() for value in payload.get("domains", []) if str(value).strip()]
    environments = [value for value in payload.get("environments", []) if value in {"dev", "tst", "prd"}]
    components = [value for value in payload.get("components", []) if value in {"engineering", "store", "analytics"}]
    mode = payload.get("mode") if payload.get("mode") in {"notebook", "copy_activity"} else "notebook"
    if not org or not capacity or not domains or not environments or not components:
        raise ValueError("org, capacity, domains, environments, and components are required")
    workspaces = []
    for domain in domains:
        for environment in environments:
            for component in components:
                workspaces.append({
                    "name": f"ws-{org}-{domain}-{component}-{environment}",
                    "capacity": capacity,
                    "items": items_for(component, domain, mode),
                })
    return {"org": org, "capacity": capacity, "domains": domains, "environments": environments, "components": components, "mode": mode, "workspaces": workspaces}


def provision_plan(plan, job_id=None):
    normalized = plan
    if not normalized.get("capacity") or not normalized.get("workspaces"):
        raise ValueError("A capacity and at least one workspace are required")
    valid_types = {"VariableLibrary", "Notebook", "DataPipeline", "Lakehouse", "SemanticModel", "Report"}
    for workspace in normalized["workspaces"]:
        if not workspace.get("name"):
            raise ValueError("Every workspace needs a name")
        normalized_items = []
        for raw_item in workspace.get("items", []):
            item = {"name": raw_item[0], "type": raw_item[1]} if isinstance(raw_item, list) else raw_item
            if not item.get("name") or item.get("type") not in valid_types:
                raise ValueError(f"Unsupported or incomplete item in {workspace['name']}")
            normalized_items.append(item)
        workspace["items"] = normalized_items
    commands = []
    for workspace in normalized["workspaces"]:
        commands.append([str(FAB), "create", f"{workspace['name']}.Workspace", "-P", f"capacityName={normalized['capacity']}"])
    lakehouses = []
    items = []
    for workspace in normalized["workspaces"]:
        for item in workspace["items"]:
            command = [str(FAB), "create", f"{workspace['name']}.Workspace/{item['name']}.{item['type']}"]
            if item.get("type") == "Lakehouse" and item.get("enableSchemas"):
                command.extend(["-P", "enableSchemas=true"])
            (lakehouses if item.get("type") == "Lakehouse" else items).append(command)
    completed = []
    all_commands = commands + lakehouses + items
    if job_id:
        JOBS[job_id].update({"status": "running", "total": len(all_commands), "completed": 0, "events": []})
    for command in all_commands:
        command_text = " ".join(command[2:])
        if job_id:
            JOBS[job_id]["events"].append({"status": "running", "command": command_text})
        print(f"Starting: {' '.join(command)}", flush=True)
        print(f"Starting: {' '.join(command)}", flush=True)
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=int(os.environ.get("FABRIC_AUTO_COMMAND_TIMEOUT", "300")))
        except subprocess.TimeoutExpired as error:
            if job_id:
                JOBS[job_id].update({"status": "failed", "error": f"Fabric command timed out: {command_text}", "failedCommand": command_text})
            raise RuntimeError(f"Fabric command timed out: {' '.join(command)}") from error
        if result.returncode:
            if job_id:
                JOBS[job_id].update({"status": "failed", "error": result.stderr.strip() or result.stdout.strip(), "failedCommand": command_text})
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"Fabric command failed: {' '.join(command)}")
        print(f"Completed: {' '.join(command)}", flush=True)
        completed.append(command_text)
        if job_id:
            JOBS[job_id]["completed"] = len(completed)
            JOBS[job_id]["events"][-1]["status"] = "completed"
    result = {"status": "completed", "workspaces": len(normalized["workspaces"]), "items": sum(len(w["items"]) for w in normalized["workspaces"]), "completed": completed}
    if job_id:
        JOBS[job_id].update(result)
    return result


def run_provision_job(job_id, plan):
    try:
        provision_plan(plan, job_id)
    except (ValueError, RuntimeError, OSError) as error:
        JOBS[job_id].update({"status": "failed", "error": str(error)})


def connect_git(payload):
    if payload.get("confirm") is not True:
        raise ValueError("Git connection requires explicit confirmation")
    required = ["organization", "project", "repository", "branch"]
    if any(not str(payload.get(value, "")).strip() for value in required):
        raise ValueError("organization, project, repository, and branch are required")
    workspaces = payload.get("workspaces", [])
    if not workspaces:
        raise ValueError("At least one workspace is required")
    directory_template = str(payload.get("directoryTemplate", "fabric/{workspace}"))
    results = []
    for workspace in workspaces:
        workspace_name = str(workspace.get("name", "")).strip()
        if not workspace_name:
            raise ValueError("Every Git workspace needs a name")
        workspace_listing = run_command([str(FAB), "api", "workspaces"])
        values = workspace_listing.get("text", {}).get("value", workspace_listing if isinstance(workspace_listing, list) else [])
        match = next((value for value in values if value.get("displayName") == workspace_name), None)
        if not match:
            raise ValueError(f"Workspace not found: {workspace_name}")
        provider = {
            "gitProviderDetails": {
                "gitProviderType": "AzureDevOps",
                "organizationName": payload["organization"],
                "projectName": payload["project"],
                "repositoryName": payload["repository"],
                "branchName": payload["branch"],
                "directoryName": directory_template.replace("{workspace}", workspace_name),
            }
        }
        run_command([str(FAB), "api", "-X", "post", f"workspaces/{match['id']}/git/connect", "-i", json.dumps(provider)])
        results.append(workspace_name)
    return {"status": "connected", "workspaces": results}


def delete_workspace(payload):
    workspace_name = str(payload.get("workspaceName", "")).strip()
    confirm_name = str(payload.get("confirmName", "")).strip()
    if payload.get("confirm") is not True or not workspace_name or confirm_name != workspace_name:
        raise ValueError("Type the exact workspace name and confirm deletion")
    if "." in workspace_name or "/" in workspace_name or "\\" in workspace_name:
        raise ValueError("Provide only the workspace display name")
    command = [str(FAB), "del", f"{workspace_name}.Workspace"]
    print(f"Deleting: {' '.join(command)}", flush=True)
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=300)
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"Workspace deletion timed out: {workspace_name}") from error
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"Fabric delete failed: {workspace_name}")
    print(f"Deleted: {workspace_name}", flush=True)
    return {"status": "deleted", "workspace": workspace_name}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND), **kwargs)

    def send_json(self, status, value):
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json(200, {"status": "ok", "service": "fabric-auto-control-panel"})
            return
        if path == "/api/azure/subscriptions":
            try:
                self.send_json(200, azure_subscriptions())
            except (RuntimeError, OSError) as error:
                self.send_json(500, {"error": str(error)})
            return
        if path == "/api/provision/status":
            job_id = urlparse(self.path).query.removeprefix("job=")
            self.send_json(200, JOBS.get(job_id, {"status": "not_found"}))
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path not in {"/api/plan", "/api/azure/capacities", "/api/provision", "/api/git/connect", "/api/workspace/delete"}:
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            if path == "/api/plan":
                self.send_json(200, build_plan(payload))
            elif path == "/api/azure/capacities":
                self.send_json(200, azure_capacities(str(payload.get("subscriptionId", ""))))
            elif path == "/api/provision":
                if payload.get("confirm") is not True:
                    raise ValueError("Provisioning requires explicit confirmation")
                job_id = uuid.uuid4().hex
                JOBS[job_id] = {"status": "queued", "completed": 0, "total": 0, "events": []}
                threading.Thread(target=run_provision_job, args=(job_id, payload.get("plan", {})), daemon=True).start()
                self.send_json(202, {"jobId": job_id, "status": "queued"})
            elif path == "/api/git/connect":
                self.send_json(200, connect_git(payload))
            elif path == "/api/workspace/delete":
                self.send_json(200, delete_workspace(payload))
        except (ValueError, RuntimeError, OSError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})


if __name__ == "__main__":
    print("Fabric Auto control panel: http://localhost:8765")
    ThreadingHTTPServer(("localhost", 8765), Handler).serve_forever()
