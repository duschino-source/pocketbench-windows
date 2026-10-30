param(
  [Parameter(Mandatory = $true)][ValidateSet('networkState','service','events')][string]$Operation,
  [ValidateSet('Dnscache','Dhcp','NlaSvc','W32Time','BITS','wuauserv','Winmgmt')][string]$ServiceName = 'Dnscache',
  [ValidateRange(1,24)][int]$Hours = 1,
  [ValidateRange(1,8)][int]$MaxEvents = 3,
  [ValidateSet('system','windows-update')][string]$Channel = 'system'
)
# Read-only native probes. No elevation, app execution, settings writes, or arbitrary queries.
$ErrorActionPreference = 'Stop'
$scmIds = @(7000,7001,7009,7011,7022,7023,7024,7031,7034)

function New-EventObject($record) {
  $message = 'Event recorded; message unavailable.'
  try {
    $value = ([string]$record.Message -replace '\s+',' ').Trim()
    if ($value) { $message = $value.Substring(0, [Math]::Min(350, $value.Length)) }
  } catch { }
  [pscustomobject]@{ id = [int]$record.Id; timeCreated = $record.TimeCreated.ToUniversalTime().ToString('o'); message = $message }
}

function Read-Events([string]$logName, [string]$serviceDisplayName = '') {
  $filter = @{ LogName = $logName; StartTime = (Get-Date).AddHours(-$Hours) }
  $limit = $MaxEvents
  if ($Operation -eq 'service') { $filter.ProviderName = 'Service Control Manager'; $filter.ID = $scmIds; $limit = 200 }
  else { $filter.Level = 1,2 }
  try {
    $records = @(Get-WinEvent -FilterHashtable $filter -MaxEvents $limit -ErrorAction Stop)
    $events = @()
    foreach ($record in $records) {
      if ($events.Count -ge $MaxEvents) { break }
      if ($Operation -eq 'service') {
        $matched = $false
        try {
          $xml = [xml]$record.ToXml()
          foreach ($node in @($xml.Event.EventData.Data)) {
            if ([string]$node.'#text' -eq $ServiceName -or [string]$node.'#text' -eq $serviceDisplayName) { $matched = $true; break }
          }
        } catch { }
        if (!$matched) { continue }
      }
      $events += New-EventObject $record
    }
    return @{ status = 'ok'; events = @($events); candidateLimitReached = ($Operation -eq 'service' -and $records.Count -eq 200) }
  } catch {
    if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { return @{ status = 'ok'; events = @(); candidateLimitReached = $false } }
    return @{ status = 'unavailable'; events = @(); note = 'Event channel could not be read with the current permissions or is unavailable.' }
  }
}

$result = @{ timestamp = [datetime]::UtcNow.ToString('o'); status = 'ok' }
if ($Operation -eq 'networkState') {
  $result.scope = 'network'; $notes = @(); $available = 0
  try {
    $profiles = @(Get-NetConnectionProfile -ErrorAction Stop)
    $result.connected = @($profiles | Where-Object { $_.IPv4Connectivity -in @('LocalNetwork','Internet') -or $_.IPv6Connectivity -in @('LocalNetwork','Internet') }).Count
    $available++
  } catch { $notes += 'Network connection profiles unavailable.' }
  try {
    $adapters = @(Get-NetAdapter -ErrorAction Stop)
    $result.adaptersTotal = $adapters.Count
    $result.adaptersConnected = @($adapters | Where-Object Status -eq 'Up').Count
    $available++
  } catch { $notes += 'Network adapter state unavailable.' }
  try {
    $proxy = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction Stop
    $result.proxyEnabled = ($null -ne $proxy.ProxyEnable -and [int]$proxy.ProxyEnable -eq 1)
    $available++
  } catch { $notes += 'Current-user proxy state unavailable.' }
  if ($available -eq 0) { $result.status = 'unavailable' } elseif ($notes.Count) { $result.status = 'partial' }
  $result.notes = @($notes)
} elseif ($Operation -eq 'service') {
  $result.scope = 'service:' + $ServiceName; $notes = @()
  try {
    $svc = Get-Service -Name $ServiceName -ErrorAction Stop
    $result.statusText = [string]$svc.Status
    $displayName = [string]$svc.DisplayName
  } catch {
    $result.status = 'unavailable'; $result.note = 'Selected service could not be read with the current permissions or is not installed.'
    $result | ConvertTo-Json -Depth 5 -Compress; return
  }
  try {
    # ServiceName is a fixed ValidateSet value, never a model-provided query fragment.
    $service = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $ServiceName + "'") -OperationTimeoutSec 3 -ErrorAction Stop | Select-Object -First 1
    if (!$service) { throw 'Selected service unavailable.' }
    $result.startMode = [string]$service.StartMode
  } catch { $notes += 'Service start mode unavailable.' }
  $events = Read-Events 'System' $displayName
  $result.events = @($events.events); $result.eventStatus = $events.status
  if ($events.status -ne 'ok') { $notes += $events.note }
  if ($events.candidateLimitReached) { $notes += 'Service event search was limited to the 200 most recent matching SCM candidates; older matching rows may be omitted.' }
  if ($notes.Count) { $result.status = 'partial' }
  $result.notes = @($notes)
} else {
  $result.scope = 'events:' + $Channel
  $logName = if ($Channel -eq 'windows-update') { 'Microsoft-Windows-WindowsUpdateClient/Operational' } else { 'System' }
  $events = Read-Events $logName
  $result.status = $events.status; $result.events = @($events.events)
  if ($events.note) { $result.note = $events.note }
}
$result | ConvertTo-Json -Depth 5 -Compress
