# Windows PowerShell 5.1 / PowerShell 7. Run from the extracted source folder.
[CmdletBinding()]
param(
 [ValidateSet('Update','Status','Backup')][string]$Action='Status',
 [string]$Server='ubuntu@129.152.8.230',
 [string]$KeyPath='',
 [string]$Branch='codex/stabilize-0.8',
 [string]$ExpectedCommit='',
 [string]$BackupDirectory="$env:USERPROFILE\Documents\TrueThrills-Backups"
)
$ErrorActionPreference='Stop'
if($Server -notmatch '^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+$'){throw 'Invalid SSH account/server.'}
if($Branch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$'){throw 'Invalid branch.'}
if($ExpectedCommit -and $ExpectedCommit -notmatch '^[a-f0-9]{40}$'){throw 'Invalid commit SHA.'}
$SshOptions=@()
if($KeyPath){$KeyPath=(Resolve-Path -LiteralPath $KeyPath).Path;$SshOptions=@('-i',$KeyPath)}
function Invoke-Remote([string]$Command){ & ssh @SshOptions $Server $Command; if($LASTEXITCODE -ne 0){throw 'SSH command failed. See the message above.'} }
if($Action -eq 'Status'){
 Invoke-Remote 'cd /opt/truethrills && git log -1 --format=%H && systemctl is-active truethrills && curl -fsS http://127.0.0.1:3000/api/health'
 exit
}
if($Action -eq 'Update'){
 # Stage only maintenance code beside existing node_modules. Do not overwrite server .env.
 Invoke-Remote 'cd /opt/truethrills && mkdir -p .update-staging'
 foreach($Name in @('update-safe.sh','backup-data.mjs','verify-backup.mjs')){
  & scp @SshOptions (Join-Path $PSScriptRoot $Name) "${Server}:/opt/truethrills/.update-staging/$Name"
  if($LASTEXITCODE -ne 0){throw 'Could not stage update scripts.'}
 }
 $Command="cd /opt/truethrills && sudo bash .update-staging/update-safe.sh '$Branch' '$ExpectedCommit'"
 Invoke-Remote $Command
 exit
}
$Reply=Invoke-Remote 'cd /opt/truethrills && sudo bash scripts/export-backup.sh'
$Info=($Reply -join "`n") | ConvertFrom-Json
if($Info.path -notmatch '^/var/tmp/TrueThrills-export-[A-Za-z0-9]+/backup\.tar\.gz$' -or $Info.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Invalid backup response.'}
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$Target=Join-Path $BackupDirectory ($Info.snapshot+'.tar.gz')
& scp @SshOptions "${Server}:$($Info.path)" $Target
if($LASTEXITCODE -ne 0){throw 'Download failed; the private server copy is retained.'}
if((Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Info.sha256){throw 'Checksum mismatch; do not use this download. Server copy retained.'}
# Remove only the temporary export, after matching the full SHA256 locally.
$RemoteFolder=$Info.path.Substring(0,$Info.path.LastIndexOf('/'))
Invoke-Remote "rm -- '$($Info.path)' && rmdir -- '$RemoteFolder'"
Write-Host "Verified backup saved: $Target"
