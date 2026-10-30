param(
  [Parameter(Mandatory = $true)][string]$Operation,
  [string]$Name = '',
  [string]$ExpectedExe = '',
  [string]$ServiceName = '',
  [string]$StateBase64 = ''
)
$ErrorActionPreference = 'Stop'

$allowed = @('getProxy','clearProxy','restoreProxy','proxyPolicy','getStartup','disableStartup','restoreStartup','requestClose','checkService','checkProcess','checkHealth','getDnsCache')
if ($allowed -notcontains $Operation) { throw 'Unsupported user operation.' }

$proxyPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$runPath = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
$allowedServices = @('Dnscache','Dhcp','NlaSvc','W32Time','BITS','wuauserv','Winmgmt')
$allowedExe = @('firefox.exe','steam.exe','obsidian.exe')

function Get-ProxyState {
  $hasEnable = $false; $enable = 0; $enableKind = 'absent'
  $hasServer = $false; $server = ''; $serverKind = 'absent'
  $key = $null
  try { $key = Get-Item -Path $proxyPath -ErrorAction Stop } catch { $key = $null }
  if ($key) {
    try {
      $names = @($key.GetValueNames())
      if ($names -contains 'ProxyEnable') {
        $hasEnable = $true
        $enable = [int](Get-ItemProperty -Path $proxyPath -Name ProxyEnable -ErrorAction Stop).ProxyEnable
        try { $enableKind = [string]$key.GetValueKind('ProxyEnable') } catch { $enableKind = 'DWord' }
      }
      if ($names -contains 'ProxyServer') {
        $hasServer = $true
        $server = [string](Get-ItemProperty -Path $proxyPath -Name ProxyServer -ErrorAction Stop).ProxyServer
        try { $serverKind = [string]$key.GetValueKind('ProxyServer') } catch { $serverKind = 'String' }
      }
    } catch { throw }
  }
  [pscustomobject]@{
    enable = $enable; server = $server
    hasEnable = $hasEnable; hasServer = $hasServer
    enableKind = $enableKind; serverKind = $serverKind
  }
}

function Set-ProxyState([pscustomobject]$state) {
  New-Item -Path $proxyPath -Force | Out-Null
  if ($state.hasEnable) {
    if ([string]$state.enableKind -ne 'DWord') { throw 'Unsupported proxy value type.' }
    Set-ItemProperty -Path $proxyPath -Name ProxyEnable -Value ([int]$state.enable) -Type DWord -ErrorAction Stop
  } else {
    Remove-ItemProperty -Path $proxyPath -Name ProxyEnable -ErrorAction SilentlyContinue
  }
  if ($state.hasServer) {
    $kind = [string]$state.serverKind
    if (@('String','ExpandString','MultiString') -notcontains $kind) { throw 'Unsupported proxy value type.' }
    Set-ItemProperty -Path $proxyPath -Name ProxyServer -Value ([string]$state.server) -Type $kind -ErrorAction Stop
  } else {
    Remove-ItemProperty -Path $proxyPath -Name ProxyServer -ErrorAction SilentlyContinue
  }
}

function Read-StateBase64([string]$b64) {
  if ([string]::IsNullOrEmpty($b64)) { throw 'Missing StateBase64.' }
  try {
    $json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))
  } catch { throw 'Invalid StateBase64 value.' }
  try { $json | ConvertFrom-Json -ErrorAction Stop } catch { throw 'Invalid StateBase64 value.' }
}

function Assert-EntryName([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -gt 128) { throw 'Invalid startup entry name.' }
  if ($value -match '[\\/:*?"<>|]') { throw 'Invalid startup entry name.' }
}

function Get-RunEntries {
  $out = @()
  try {
    $key = Get-Item -Path $runPath -ErrorAction SilentlyContinue
    if ($key) {
      foreach ($v in @($key.GetValueNames())) {
        $val = ''
        try { $val = [string](Get-ItemProperty -Path $runPath -Name $v -ErrorAction Stop).$v } catch { continue }
        $kind = 'String'
        try { $kind = [string]$key.GetValueKind($v) } catch { $kind = 'String' }
        $out += [pscustomobject]@{ id = ('HKCU\Run\' + $v); name = [string]$v; command = $val; kind = $kind }
      }
    }
  } catch { throw }
  return $out
}

function Assert-ExpectedExe([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Length -gt 512) { throw 'Invalid ExpectedExe value.' }
  if ($value -match '[\x00\r\n"]') { throw 'Invalid ExpectedExe value.' }
  $lower = $value.ToLower()
  $ok = $false
  foreach ($b in $allowedExe) {
    if ($lower -eq $b -or $lower.EndsWith(([string][char]92) + $b) -or $lower.EndsWith('/' + $b)) { $ok = $true }
  }
  if (-not $ok) { throw 'ExpectedExe must be the full path to firefox.exe, steam.exe, or obsidian.exe.' }
  if ($value -notmatch '^(?:[A-Za-z]:[\\/]|\\\\)') { throw 'ExpectedExe must be an absolute path.' }
}

function Get-CurrentUserSid {
  [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}

function Get-ExactPathProcesses([string]$fullPath) {
  $target = [System.IO.Path]::GetFullPath($fullPath)
  $sid = Get-CurrentUserSid
  $found = @()
  foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
    $path = $null
    try { $path = $p.Path } catch { continue }
    if ([string]::IsNullOrEmpty($path)) { continue }
    try {
      if ([System.IO.Path]::GetFullPath($path) -ne $target) { continue }
    } catch { continue }
    try {
      $owner = Invoke-CimMethod -InputObject (Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId=" + $p.Id) -ErrorAction Stop) -MethodName GetOwner -ErrorAction Stop
      $ownerSid = $null
      try {
        $acct = New-Object System.Security.Principal.NTAccount($owner.Domain, $owner.User)
        $ownerSid = ($acct.Translate([System.Security.Principal.SecurityIdentifier])).Value
      } catch { throw 'Unable to verify process ownership; repair paused.' }
      if ($ownerSid -ne $sid) { continue }
    } catch { throw 'Unable to verify process ownership; repair paused.' }
    $found += $p
  }
  return $found
}

function Test-PendingReboot {
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

if ($Operation -eq 'getProxy') {
  Get-ProxyState | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'clearProxy') {
  $before = Get-ProxyState
  if ($before.hasEnable -and ([string]$before.enableKind -ne 'DWord')) { throw 'Unsupported proxy value type.' }
  if ($before.hasServer -and (@('String','ExpandString','MultiString') -notcontains ([string]$before.serverKind))) { throw 'Unsupported proxy value type.' }
  New-Item -Path $proxyPath -Force | Out-Null
  Set-ItemProperty -Path $proxyPath -Name ProxyEnable -Value 0 -Type DWord -ErrorAction Stop
  Remove-ItemProperty -Path $proxyPath -Name ProxyServer -ErrorAction SilentlyContinue
  $after = Get-ProxyState
  [pscustomobject]@{ before = $before; after = $after } | ConvertTo-Json -Depth 4 -Compress
  return
}

if ($Operation -eq 'restoreProxy') {
  $state = Read-StateBase64 $StateBase64
  foreach ($f in @('enable','server','hasEnable','hasServer','enableKind','serverKind')) {
    if ($null -eq $state.$f) { throw 'Invalid proxy backup state.' }
  }
  Set-ProxyState $state
  Get-ProxyState | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'proxyPolicy') {
  $pinned = ''
  $policyPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings'
  $exists = $false
  try { $exists = Test-Path $policyPath } catch { throw 'Unable to read proxy policy state.' }
  if ($exists) {
    try {
      $p = Get-ItemProperty -Path $policyPath -ErrorAction Stop
      if ($p.ProxySettingsPerUser -eq 0) { $pinned = 'ProxySettingsPerUser=0' }
      elseif ($null -ne $p.Proxy) { $pinned = 'ProxyPolicyPresent' }
    } catch { throw 'Unable to read proxy policy state.' }
  }
  [pscustomobject]@{ pinned = $pinned } | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'getStartup') {
  ConvertTo-Json -InputObject @(Get-RunEntries) -Depth 4 -Compress
  return
}

if ($Operation -eq 'disableStartup') {
  Assert-EntryName $Name
  $entries = @(Get-RunEntries)
  $match = $entries | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if (-not $match) { throw 'Startup entry is no longer present. Scan again.' }
  $beforeKind = [string]$match.kind
  if (@('String','ExpandString') -notcontains $beforeKind) { throw 'Unsupported startup entry kind.' }
  Remove-ItemProperty -Path $runPath -Name $Name -ErrorAction Stop
  [pscustomobject]@{ name = $Name; before = [string]$match.command; kind = $beforeKind } | ConvertTo-Json -Depth 4 -Compress
  return
}

if ($Operation -eq 'restoreStartup') {
  $state = Read-StateBase64 $StateBase64
  if ([string]::IsNullOrWhiteSpace($state.name)) { throw 'Invalid startup backup state.' }
  if ($null -eq $state.command) { throw 'Invalid startup backup state.' }
  if (@('String','ExpandString') -notcontains ([string]$state.kind)) { throw 'Unsupported startup entry kind.' }
  Assert-EntryName ([string]$state.name)
  $cmd = [string]$state.command
  if ($cmd.Length -gt 2048 -or $cmd -match '[\r\n]') { throw 'Invalid startup command.' }
  New-Item -Path $runPath -Force | Out-Null
  Set-ItemProperty -Path $runPath -Name ([string]$state.name) -Value $cmd -Type ([string]$state.kind) -ErrorAction Stop
  [pscustomobject]@{ name = [string]$state.name; command = $cmd; kind = [string]$state.kind } | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'requestClose') {
  Assert-ExpectedExe $ExpectedExe
  $procs = @(Get-ExactPathProcesses $ExpectedExe)
  $found = $procs.Count
  $requested = 0
  foreach ($p in $procs) {
    try { if ($p.CloseMainWindow()) { $requested++ } } catch { }
  }
  Start-Sleep -Milliseconds 1500
  $remaining = @(Get-ExactPathProcesses $ExpectedExe).Count
  [pscustomobject]@{ found = $found; remaining = $remaining; requested = $requested } | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'checkProcess') {
  Assert-ExpectedExe $ExpectedExe
  $procs = @(Get-ExactPathProcesses $ExpectedExe)
  [pscustomobject]@{ found = $procs.Count; remaining = $procs.Count } | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'checkService') {
  if ($allowedServices -notcontains $ServiceName) { throw 'Unsupported service name.' }
  $status = ''
  try { $status = [string](Get-Service -Name $ServiceName -ErrorAction Stop).Status } catch { $status = 'Unknown' }
  [pscustomobject]@{ status = $status } | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'checkHealth') {
  $reasons = @(Test-PendingReboot)
  $pending = $reasons.Count -gt 0
  # No pending reboot does not imply OS integrity. Without an independent
  # integrity check, report unhealthy so callers do not treat absence of a
  # reboot flag as a healthy OS.
  $healthy = $false
  $summary = if ($pending) { 'Pending reboot: ' + ($reasons -join ', ') } else { 'No independent integrity check available; health cannot be confirmed.' }
  [pscustomobject]@{ healthy = $healthy; pendingReboot = $pending; summary = $summary } | ConvertTo-Json -Depth 3 -Compress
  return
}

if ($Operation -eq 'getDnsCache') {
  $count = 0
  try { $count = (Get-DnsClientCache -ErrorAction Stop | Measure-Object).Count } catch { throw 'Unable to read DNS cache.' }
  [pscustomobject]@{ count = [int]$count } | ConvertTo-Json -Depth 3 -Compress
  return
}

throw 'Unsupported user operation.'
