$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Url = "http://localhost:8765"
$Python = Join-Path $Root ".venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
	throw "Project Python environment not found at $Python"
}

Start-Process $Url
Write-Output "Fabric Auto frontend: $Url"
Write-Output "Press Ctrl+C to stop the server."
& $Python (Join-Path $Root "scripts\control-panel.py")
