param(
  [Parameter(Mandatory = $true)][string]$Operation,
  [string]$ServiceName = '',
  [string]$Receipt = ''
)
$ErrorActionPreference = 'Stop'

$allowedOperations = @('flushDns', 'startService', 'integrityRepair')
if ($allowedOperations -notcontains $Operation) { Write-Error 'Unsupported elevated operation.'; exit 2 }
$allowedServices = @('Dnscache', 'Dhcp', 'NlaSvc', 'W32Time', 'BITS', 'wuauserv', 'Winmgmt')
if ($Operation -eq 'startService' -and $allowedServices -notcontains $ServiceName) { Write-Error 'Unsupported service name.'; exit 2 }
if ([string]::IsNullOrWhiteSpace($Receipt)) { Write-Error 'Missing receipt path.'; exit 2 }

function Get-SafeReceiptPath([string]$value) {
  if ($value.Length -gt 512 -or $value -match '[\r\n]') { throw 'Invalid receipt path.' }
  $full = [System.IO.Path]::GetFullPath($value)
  $parent = Split-Path -Parent $full
  if ([string]::IsNullOrEmpty($parent) -or -not (Test-Path $parent)) { throw 'Receipt directory is missing.' }
  $item = $null
  try { $item = Get-Item -Path $parent -ErrorAction Stop } catch { throw 'Receipt directory is missing.' }
  if ($item.LinkType) { throw 'Refusing receipt inside a linked directory.' }
  if ((Split-Path -Leaf $full) -notmatch '^receipt-[A-Za-z0-9][A-Za-z0-9.-]*\.json$') { throw 'Unexpected receipt name.' }
  return $full
}

function Test-ElevatedPendingReboot {
  $reasons = @()
  try {
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $reasons += 'CBS RebootPending' }
  } catch { throw }
  try {
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $reasons += 'WindowsUpdate RebootRequired' }
  } catch { throw }
  try {
    $pfro = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
    if ($pfro -and $pfro.PendingFileRenameOperations) { $reasons += 'PendingFileRenameOperations' }
  } catch { throw }
  return $reasons
}

$receiptPath = Get-SafeReceiptPath $Receipt
try {
  $stream = [System.IO.File]::Open($receiptPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $stream.Close()
  Remove-Item -Path $receiptPath -Force -ErrorAction Stop
} catch {
  Write-Error 'Refusing to overwrite an existing receipt.'
  exit 2
}

$result = [pscustomobject]@{ operation = $Operation; success = $false; output = ''; pendingReboot = $false; exitCode = 1 }

try {
  if ($Operation -eq 'flushDns') {
    $before = -1
    try { $before = (Get-DnsClientCache -ErrorAction SilentlyContinue | Measure-Object).Count } catch { }
    Clear-DnsClientCache -ErrorAction Stop
    $after = -1
    try { $after = (Get-DnsClientCache -ErrorAction SilentlyContinue | Measure-Object).Count } catch { }
    $result.success = $true
    $result.exitCode = 0
    $result.output = "DNS resolver cache cleared (entries before: $before, after: $after)."
  }
  elseif ($Operation -eq 'startService') {
    $svc = Get-Service -Name $ServiceName -ErrorAction Stop
    if ($svc.Status -ne 'Running') { Start-Service -Name $ServiceName -ErrorAction Stop }
    $svc = Get-Service -Name $ServiceName -ErrorAction Stop
    $result.success = ($svc.Status -eq 'Running')
    $result.exitCode = if ($result.success) { 0 } else { 1 }
    $result.output = "Service $ServiceName status: $($svc.Status)."
  }
  elseif ($Operation -eq 'integrityRepair') {
    $dism = dism.exe /Online /Cleanup-Image /RestoreHealth 2>&1 | Out-String
    $dismCode = $LASTEXITCODE
    $sfc = ''
    $sfcCode = 1
    $dismOk = ($dismCode -eq 0)
    if ($dismOk) {
      $sfc = sfc.exe /scannow 2>&1 | Out-String
      $sfcCode = $LASTEXITCODE
    }
    # New read-only post-repair health verification (no repair flags).
    $check = ''
    $verify = ''
    try { $check = Repair-WindowsImage -Online -CheckHealth 2>&1 | Out-String } catch { $check = 'Repair-WindowsImage CheckHealth failed: ' + $_.Exception.Message }
    try { $verify = sfc.exe /verifyonly 2>&1 | Out-String } catch { $verify = 'SFC verifyonly failed: ' + $_.Exception.Message }
    $checkOk = ($check -match 'No component store corruption detected')
    $verifyOk = ($verify -match 'did not find any integrity violations' -or $verify -match 'found corrupt files and successfully repaired them')
    # Require positive known English verification text; anything else is unhealthy.
    $healthVerified = ($dismOk -and ($sfcCode -eq 0) -and $checkOk -and $verifyOk)
    $combined = "DISM exit ${dismCode}: " + $dism + "`nSFC exit ${sfcCode}: " + $sfc + "`nCheckHealth: " + $check + "`nVerifyOnly: " + $verify
    if ($combined.Length -gt 16000) { $combined = $combined.Substring(0, 16000) }
    $result.output = $combined
    $result.exitCode = if ($dismOk) { $sfcCode } else { $dismCode }
    $result.data = [pscustomobject]@{ healthVerified = [bool]$healthVerified }
    $reasons = @(Test-ElevatedPendingReboot)
    $result.pendingReboot = $reasons.Count -gt 0
    $result.success = [bool]$healthVerified
  }
}
catch {
  $result.success = $false
  $result.exitCode = 2
  $result.output = 'Elevated operation failed: ' + $_.Exception.Message
}

$json = $result | ConvertTo-Json -Depth 4 -Compress
try {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $stream = [System.IO.File]::Open($receiptPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
} catch {
  Write-Error 'Unable to write the elevated receipt.'
  exit 1
}
if (-not $result.success) { exit 1 }
exit 0
