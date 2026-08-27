# Provision explicitly named Fabric workspaces and items from fabric-platform.yaml.
# Use -Preview to inspect the plan or -Yes to skip the confirmation prompt.

$ErrorActionPreference = "Stop"
$Python = Join-Path $PSScriptRoot "..\.venv\Scripts\python.exe"
$Runner = Join-Path $PSScriptRoot "provision.py"

if (-not (Test-Path $Python)) {
    throw "Python virtual environment not found at $Python"
}

& $Python $Runner @args
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
