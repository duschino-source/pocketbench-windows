param(
  [Parameter(Mandatory = $true)][string]$ElevateScript,
  [Parameter(Mandatory = $true)][string]$Operation,
  [Parameter(Mandatory = $true)][string]$Receipt,
  [string]$ServiceName = ''
)
$ErrorActionPreference = 'Stop'

$allowedOperations = @('flushDns', 'startService', 'integrityRepair')
if ($allowedOperations -notcontains $Operation) { throw 'Unsupported elevated operation.' }
if ([string]::IsNullOrWhiteSpace($ElevateScript) -or [string]::IsNullOrWhiteSpace($Receipt)) { throw 'Missing launcher input.' }
if ($ElevateScript.Length -gt 512 -or $Receipt.Length -gt 512) { throw 'Launcher input too long.' }
if ($ElevateScript -match '[\r\n"]' -or $Receipt -match '[\r\n"]') { throw 'Invalid launcher input.' }

$helperPath = [System.IO.Path]::GetFullPath($ElevateScript)
$receiptPath = [System.IO.Path]::GetFullPath($Receipt)
$helperLeaf = Split-Path -Leaf $helperPath
if ($helperLeaf -ne 'elevate.ps1') { throw 'Unexpected elevated helper.' }
if (-not (Test-Path $helperPath -PathType Leaf)) { throw 'Elevated helper is missing.' }
if ((Split-Path -Leaf $receiptPath) -notmatch '^receipt-[A-Za-z0-9][A-Za-z0-9.-]*\.json$') { throw 'Unexpected receipt name.' }
if (Test-Path $receiptPath) { throw 'Refusing to overwrite an existing receipt.' }

$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $helperPath + '" -Operation ' + $Operation
if ($Operation -eq 'startService') {
  $allowedServices = @('Dnscache', 'Dhcp', 'NlaSvc', 'W32Time', 'BITS', 'wuauserv', 'Winmgmt')
  if ($allowedServices -notcontains $ServiceName) { throw 'Unsupported service name.' }
  $arguments += ' -ServiceName ' + $ServiceName
}
$arguments += ' -Receipt "' + $receiptPath + '"'

$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -PassThru -Wait
exit $process.ExitCode
