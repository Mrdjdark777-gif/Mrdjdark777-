# Old location. The real script is tools/windows/TrueThrills-Server.ps1 (folder layout of 2026-10-09).
# This forwarder keeps old shortcuts and commands working. Edit only tools/windows/TrueThrills-Server.ps1.
& (Join-Path $PSScriptRoot '..\tools\windows\TrueThrills-Server.ps1') @args
exit $LASTEXITCODE
