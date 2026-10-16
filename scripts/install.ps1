# Builds the NSIS installer and installs Postie for the current user (no admin needed).
# The installer creates the Start menu shortcut and registers an uninstaller under Settings > Apps.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

npm install
if ($LASTEXITCODE) { throw 'npm install failed' }

npm run tauri build
if ($LASTEXITCODE) { throw 'tauri build failed' }

$setup = Get-ChildItem src-tauri\target\release\bundle\nsis\*-setup.exe | Sort-Object LastWriteTime | Select-Object -Last 1
Start-Process $setup.FullName -ArgumentList '/S' -Wait
Write-Host "Installed $($setup.Name). Search 'Postie' in the Start menu."
