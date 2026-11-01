param(
  [ValidateSet('networkState','service','events')][string]$Operation = '',
  [ValidateSet('updateReadiness','resourcePressure','storage','startup','appHealth')][string]$Check = '',
  [ValidateSet('Dnscache','Dhcp','NlaSvc','W32Time','BITS','wuauserv','Winmgmt')][string]$ServiceName = 'Dnscache',
  [ValidateRange(1,24)][int]$Hours = 1,
  [ValidateRange(1,8)][int]$MaxEvents = 3,
  [ValidateSet('system','windows-update')][string]$Channel = 'system',
  [ValidateRange(1,5)][int]$DurationSeconds = 2,
  [ValidateRange(2,5)][int]$SampleCount = 3,
  [ValidateRange(1,50)][int]$MaxEntries = 25,
  [ValidateSet('firefox','steam','obsidian')][string]$App = 'firefox'
)
# Read-only native probes. No elevation, app execution, settings writes, or arbitrary queries.
$ErrorActionPreference = 'Stop'
$scmIds = @(7000,7001,7009,7011,7022,7023,7024,7031,7034)

if ([string]::IsNullOrEmpty($Operation) -and [string]::IsNullOrEmpty($Check)) {
  throw 'A fixed operation or check is required.'
}
if (-not [string]::IsNullOrEmpty($Operation) -and -not [string]::IsNullOrEmpty($Check)) {
  throw 'Specify either Operation or Check, not both.'
}

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

# Fixed pending-restart indicators and fixed servicing services. No model-provided key or filter is used.
function Get-UpdateReadiness {
  $result = @{ timestamp = [datetime]::UtcNow.ToString('o'); status = 'ok'; scope = 'updates:readiness'; notes = @(); restartFlags = @{}; services = @(); events = @() }
  $available = 0
  $flagChecks = @(
    @{ key = 'cbs'; path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending' },
    @{ key = 'windowsUpdate'; path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired' },
    @{ key = 'pendingFileRename'; path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager'; property = 'PendingFileRenameOperations' }
  )
  $flagCount = 0
  foreach ($check in $flagChecks) {
    try {
      if ($check.property) {
        $value = Get-ItemProperty -LiteralPath $check.path -ErrorAction Stop
        $pending = ($null -ne $value.($check.property)) -and (@($value.($check.property)).Count -gt 0)
      } else {
        $pending = Test-Path -LiteralPath $check.path
      }
      $result.restartFlags[$check.key] = [bool]$pending
      $flagCount++
    } catch {
      $result.notes += ('Restart flag ' + $check.key + ' unavailable.')
    }
  }
  if ($flagCount -gt 0) { $available++ }
  foreach ($name in @('wuauserv','BITS','Winmgmt','TrustedInstaller')) {
    try {
      $svc = Get-Service -Name $name -ErrorAction Stop
      $row = @{ name = $name; status = [string]$svc.Status }
      try {
        # $name is a fixed literal from the array above.
        $cim = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $name + "'") -OperationTimeoutSec 3 -ErrorAction Stop | Select-Object -First 1
        if ($cim) { $row.startMode = [string]$cim.StartMode }
      } catch { $result.notes += ('Start mode unavailable for ' + $name + '.') }
      $result.services += $row
      $available++
    } catch {
      $result.notes += ('Selected servicing service ' + $name + ' unavailable.')
    }
  }
  $events = Read-Events 'Microsoft-Windows-WindowsUpdateClient/Operational'
  $result.events = @($events.events)
  $result.eventStatus = $events.status
  if ($events.status -ne 'ok') { $result.notes += $events.note }
  if ($available -eq 0) { $result.status = 'unavailable' } elseif ($result.notes.Count -gt 0) { $result.status = 'partial' }
  return $result
}

# Bounded CPU/memory samples and top contributors. No process is signalled or changed.
function Get-ResourcePressure {
  $result = @{ timestamp = [datetime]::UtcNow.ToString('o'); status = 'ok'; scope = 'performance:resource-pressure'; notes = @(); samples = @(); topCpu = @(); topMemory = @() }
  $available = 0
  $interval = [int][Math]::Max(250, [Math]::Floor(($DurationSeconds * 1000) / $SampleCount))
  $before = @{}
  $names = @{}
  try {
    foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
      try {
        $id = [int]$proc.Id
        $before[$id] = [double]$proc.CPU
        $names[$id] = [string]$proc.ProcessName
      } catch { }
    }
  } catch { }
  $sampled = 0
  for ($i = 0; $i -lt $SampleCount; $i++) {
    if ($i -gt 0) { Start-Sleep -Milliseconds $interval }
    try {
      $cpu = Get-CimInstance -ClassName Win32_Processor -OperationTimeoutSec 3 -ErrorAction Stop | Measure-Object -Property LoadPercentage -Average
      if ($null -ne $cpu.Average) {
        $result.samples += [double]$cpu.Average
        $sampled++
      }
    } catch { }
  }
  if ($sampled -gt 0) {
    $result.cpuPercent = [double](($result.samples | Measure-Object -Average).Average)
    $available++
  } else {
    $result.notes += 'CPU sampling unavailable.'
  }
  try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -OperationTimeoutSec 3 -ErrorAction Stop | Select-Object -First 1
    if ($os) {
      $result.memoryTotalBytes = [int64]$os.TotalVisibleMemorySize * 1024
      $result.memoryAvailableBytes = [int64]$os.FreePhysicalMemory * 1024
      $available++
    }
  } catch { $result.notes += 'Memory availability unavailable.' }
  $after = @{}
  try {
    foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
      try { $after[[int]$proc.Id] = [double]$proc.CPU } catch { }
    }
  } catch { }
  $deltas = @()
  foreach ($id in $before.Keys) {
    if ($after.ContainsKey($id)) {
      $delta = [double]$after[$id] - [double]$before[$id]
      if ($delta -ge 0) { $deltas += @{ name = [string]$names[$id]; cpuSeconds = [Math]::Round($delta, 3) } }
    }
  }
  $result.topCpu = @($deltas | Sort-Object -Property { $_.cpuSeconds } -Descending | Select-Object -First 5)
  try {
    $memoryRows = @(Get-Process -ErrorAction SilentlyContinue | Group-Object ProcessName | ForEach-Object {
      $sum = [int64]0
      foreach ($proc in $_.Group) { $sum += [int64]$proc.WorkingSet64 }
      @{ name = [string]$_.Name; workingSetBytes = $sum }
    } | Sort-Object -Property { $_.workingSetBytes } -Descending | Select-Object -First 5)
    $result.topMemory = $memoryRows
    if ($memoryRows.Count -gt 0) { $available++ }
  } catch { $result.notes += 'Top memory contributors unavailable.' }
  $result.durationSeconds = $DurationSeconds
  $result.sampleCount = $SampleCount
  if ($available -eq 0) { $result.status = 'unavailable' } elseif ($result.notes.Count -gt 0) { $result.status = 'partial' }
  return $result
}

# Bounded traversal inside an allow-listed cache directory. Reparse points are skipped and never followed.
function Get-DirectoryUsage([string]$Path, [int]$Limit) {
  $row = @{ present = $false; sizeBytes = [int64]0; fileCount = 0; skippedReparsePoints = 0; truncated = $false }
  try {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) { return $row }
    $root = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    $row.present = $true
    if (($root.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      $row.skippedReparsePoints = 1
      return $row
    }
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue(@($root.FullName, 0))
    $scanned = 0
    $visited = 0
    while (($queue.Count -gt 0) -and ($scanned -lt $Limit)) {
      $entry = $queue.Dequeue()
      $dir = [string]$entry[0]
      $depth = [int]$entry[1]
      $children = @()
      try { $children = @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop) } catch { continue }
      foreach ($child in $children) {
        if ($scanned -ge $Limit) { $row.truncated = $true; break }
        if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
          $row.skippedReparsePoints++
          continue
        }
        if ($child.PSIsContainer) {
          if (($depth -lt 2) -and ($visited -lt 200)) {
            $queue.Enqueue(@($child.FullName, ($depth + 1)))
            $visited++
          } else {
            $row.truncated = $true
          }
        } else {
          try {
            $row.sizeBytes += [int64]$child.Length
            $row.fileCount++
            $scanned++
          } catch { }
        }
      }
    }
  } catch { }
  return $row
}

# Fixed volume query plus fixed cache allow-list. No caller path, drive, or glob is accepted.
function Get-StorageState {
  $result = @{ timestamp = [datetime]::UtcNow.ToString('o'); status = 'ok'; scope = 'storage:volumes+cache-roots'; notes = @(); volumes = @(); cacheRoots = @() }
  $available = 0
  try {
    $drives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' -OperationTimeoutSec 5 -ErrorAction Stop | Select-Object -First 8)
    foreach ($drive in $drives) {
      $result.volumes += @{ drive = [string]$drive.DeviceID; totalBytes = [int64]$drive.Size; freeBytes = [int64]$drive.FreeSpace }
    }
    $available++
  } catch { $result.notes += 'Volume availability unavailable.' }

  $candidates = @(
    @{ id = 'firefox-cache2'; base = (Join-Path $env:LOCALAPPDATA 'Mozilla\Firefox\Profiles'); names = @('cache2'); profileScoped = $true },
    @{ id = 'firefox-startupcache'; base = (Join-Path $env:LOCALAPPDATA 'Mozilla\Firefox\Profiles'); names = @('startupCache'); profileScoped = $true },
    @{ id = 'firefox-shader-cache'; base = (Join-Path $env:LOCALAPPDATA 'Mozilla\Firefox\Profiles'); names = @('shader-cache'); profileScoped = $true },
    @{ id = 'firefox-thumbnails'; base = (Join-Path $env:LOCALAPPDATA 'Mozilla\Firefox\Profiles'); names = @('thumbnails'); profileScoped = $true },
    @{ id = 'steam-htmlcache'; base = (Join-Path $env:LOCALAPPDATA 'Steam'); names = @('htmlcache'); profileScoped = $false },
    @{ id = 'steam-appcache'; base = (Join-Path $env:LOCALAPPDATA 'Steam'); names = @('appcache'); profileScoped = $false },
    @{ id = 'steam-shadercache'; base = (Join-Path $env:LOCALAPPDATA 'Steam'); names = @('shadercache'); profileScoped = $false },
    @{ id = 'obsidian-Cache'; base = (Join-Path $env:APPDATA 'obsidian'); names = @('Cache'); profileScoped = $false },
    @{ id = 'obsidian-CodeCache'; base = (Join-Path $env:APPDATA 'obsidian'); names = @('Code Cache'); profileScoped = $false },
    @{ id = 'obsidian-GPUCache'; base = (Join-Path $env:APPDATA 'obsidian'); names = @('GPUCache'); profileScoped = $false }
  )
  foreach ($candidate in $candidates) {
    $row = @{ id = $candidate.id; present = $false; sizeBytes = [int64]0; fileCount = 0; skippedReparsePoints = 0; truncated = $false }
    $parts = @()
    try { $parts = @(Get-ChildItem -LiteralPath $candidate.base -Force -ErrorAction Stop | Select-Object -First 12) } catch { $parts = @() }
    foreach ($part in $parts) {
      if (($part.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        $row.skippedReparsePoints++
        continue
      }
      if (-not $part.PSIsContainer) { continue }
      $targets = @()
      if ($candidate.profileScoped) {
        try {
          foreach ($leaf in @(Get-ChildItem -LiteralPath $part.FullName -Force -ErrorAction Stop | Select-Object -First 12)) {
            if (($leaf.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
              $row.skippedReparsePoints++
              continue
            }
            if ($leaf.PSIsContainer -and ($candidate.names -contains $leaf.Name)) { $targets += $leaf.FullName }
          }
        } catch { }
      } elseif ($candidate.names -contains $part.Name) {
        $targets += $part.FullName
      }
      foreach ($target in $targets) {
        $usage = Get-DirectoryUsage $target $MaxEntries
        if ($usage.present) {
          $row.present = $true
          $row.sizeBytes += [int64]$usage.sizeBytes
          $row.fileCount += [int]$usage.fileCount
          $row.skippedReparsePoints += [int]$usage.skippedReparsePoints
          if ($usage.truncated) { $row.truncated = $true }
        }
      }
    }
    if ($row.present) {
      $available++
      $result.cacheRoots += $row
    }
  }
  if ($available -eq 0) { $result.status = 'unavailable' } elseif ($result.notes.Count -gt 0) { $result.status = 'partial' }
  return $result
}

# Read-only startup inventory. The raw command line is never included in output.
function Get-StartupInventory {
  $result = @{ timestamp = [datetime]::UtcNow.ToString('o'); status = 'ok'; scope = 'startup:inventory'; notes = @(); entries = @() }
  $securityPattern = '(?i)(defender|securityhealth|security[_ -]?center|antivirus|antimalware|firewall|bitdefender|norton|mcafee|kaspersky|avast|\bavg\b|eset|sophos|malwarebytes|sentinelone|crowdstrike|carbon[_ -]?black|windows.?security)'
  $keys = @(
    @{ location = 'HKCU Run'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' },
    @{ location = 'HKLM Run'; path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' },
    @{ location = 'HKCU RunOnce'; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' },
    @{ location = 'HKLM RunOnce'; path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce' }
  )
  $count = 0
  foreach ($key in $keys) {
    try {
      $item = Get-ItemProperty -LiteralPath $key.path -ErrorAction Stop
      foreach ($property in @($item.PSObject.Properties)) {
        if ($count -ge $MaxEntries) { break }
        if ($property.Name -like 'PS*') { continue }
        $name = [string]$property.Name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $command = [string]$property.Value
        $publisher = ''
        $exe = ''
        if ($command -match '^\s*"([^"]+\.exe)"') { $exe = $matches[1] }
        elseif ($command -match '^\s*([^\s]+\.exe)') { $exe = $matches[1] }
        if ($exe -and (Test-Path -LiteralPath $exe -PathType Leaf)) {
          try { $publisher = [string](Get-Item -LiteralPath $exe -ErrorAction Stop).VersionInfo.CompanyName } catch { }
        }
        $entry = @{ name = $name; location = $key.location; enabled = $true; protected = [bool](($name + ' ' + $command) -match $securityPattern) }
        if ($publisher) { $entry.publisher = $publisher }
        $result.entries += $entry
        $count++
      }
    } catch {
      $result.notes += ('Startup location ' + $key.location + ' unavailable.')
    }
  }
  $folders = @(
    @{ location = 'Startup folder (user)'; path = (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup') },
    @{ location = 'Startup folder (common)'; path = (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Startup') }
  )
  foreach ($folder in $folders) {
    try {
      foreach ($file in @(Get-ChildItem -LiteralPath $folder.path -Force -File -ErrorAction Stop | Where-Object { $_.Extension -match '^\.(lnk|url|exe|bat|cmd|vbs|ps1)$' } | Select-Object -First $MaxEntries)) {
        if ($count -ge $MaxEntries) { break }
        $result.entries += @{ name = [string]$file.BaseName; location = $folder.location; enabled = $true; protected = [bool]([string]$file.BaseName -match $securityPattern) }
        $count++
      }
    } catch { }
  }
  if (($count -eq 0) -and ($result.notes.Count -gt 0)) { $result.status = 'unavailable' } elseif ($result.notes.Count -gt 0) { $result.status = 'partial' }
  return $result
}

# Running state and known-profile ambiguity only. No raw private profile or log content is returned.
function Get-AppHealth {
  $result = @{ timestamp = [datetime]::UtcNow.ToString('o'); status = 'ok'; scope = ('app:' + $App); notes = @() }
  $processNames = @()
  if ($App -eq 'firefox') { $processNames = @('firefox') }
  elseif ($App -eq 'steam') { $processNames = @('steam','steamwebhelper') }
  else { $processNames = @('obsidian') }
  $available = 0
  try {
    $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $processNames -contains ([string]$_.ProcessName).ToLowerInvariant() })
    $result.running = ($processes.Count -gt 0)
    $count = $processes.Count
    if ($count -gt 64) { $count = 64 }
    $result.processCount = $count
    $available++
  } catch { $result.notes += 'Running state unavailable.' }

  $profileCount = -1
  if ($App -eq 'firefox') {
    try {
      $ini = Join-Path $env:APPDATA 'Mozilla\Firefox\profiles.ini'
      if (Test-Path -LiteralPath $ini -PathType Leaf) {
        # Count profile sections only; no profile setting is read into the result.
        $profileCount = @(Get-Content -LiteralPath $ini -ErrorAction Stop | Where-Object { $_ -match '^\[Profile[0-9]+\]$' }).Count
      } else {
        $profiles = Join-Path $env:APPDATA 'Mozilla\Firefox\Profiles'
        if (Test-Path -LiteralPath $profiles -PathType Container) {
          $profileCount = @(Get-ChildItem -LiteralPath $profiles -Force -ErrorAction Stop | Where-Object { $_.PSIsContainer }).Count
        } else { $profileCount = 0 }
      }
      $available++
    } catch { $result.notes += 'Firefox profile count unavailable.' }
  } elseif ($App -eq 'steam') {
    try {
      $roots = @()
      if (${env:ProgramFiles(x86)}) { $roots += (Join-Path ${env:ProgramFiles(x86)} 'Steam\userdata') }
      if ($env:ProgramFiles) { $roots += (Join-Path $env:ProgramFiles 'Steam\userdata') }
      $profileCount = 0
      foreach ($root in $roots) {
        if (Test-Path -LiteralPath $root -PathType Container) {
          $profileCount += @(Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop | Where-Object { $_.PSIsContainer -and ($_.Name -match '^[0-9]+$') }).Count
        }
      }
      $available++
    } catch { $result.notes += 'Steam profile count unavailable.' }
  } else {
    try {
      $jsonPath = Join-Path $env:APPDATA 'obsidian\obsidian.json'
      if (Test-Path -LiteralPath $jsonPath -PathType Leaf) {
        # Parse for a count only; vault names and paths are never returned.
        $config = Get-Content -LiteralPath $jsonPath -Raw -ErrorAction Stop | ConvertFrom-Json
        if ($null -ne $config.vaults) { $profileCount = @($config.vaults.PSObject.Properties).Count } else { $profileCount = 0 }
      } else { $profileCount = 0 }
      $available++
    } catch { $result.notes += 'Obsidian profile count unavailable.' }
  }
  if ($profileCount -ge 0) {
    $result.profileCount = $profileCount
    if ($profileCount -gt 1) { $result.profileState = 'multiple'; $result.ambiguous = $true }
    else { $result.profileState = 'single'; $result.ambiguous = $false }
  }
  if ($available -eq 0) { $result.status = 'unavailable' } elseif ($result.notes.Count -gt 0) { $result.status = 'partial' }
  return $result
}

if (-not [string]::IsNullOrEmpty($Check)) {
  if ($Check -eq 'updateReadiness') { $result = Get-UpdateReadiness }
  elseif ($Check -eq 'resourcePressure') { $result = Get-ResourcePressure }
  elseif ($Check -eq 'storage') { $result = Get-StorageState }
  elseif ($Check -eq 'startup') { $result = Get-StartupInventory }
  elseif ($Check -eq 'appHealth') { $result = Get-AppHealth }
  else { throw 'Unsupported fixed check.' }
} else {
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
    try {
      # Fixed read-only trigger query; a trigger-start service that is stopped is expected, not broken.
      $triggerText = (& sc.exe qtriggerinfo $ServiceName 2>&1 | Out-String)
      if ($triggerText -match 'START SERVICE ON|STOP SERVICE ON') { $result.triggerStart = $true }
      elseif ($triggerText -match 'does not have any trigger|FAILED 1168|OpenService FAILED') { $result.triggerStart = $false }
      else { $result.triggerStart = $false; if ($triggerText -match 'FAILED|Access is denied') { $notes += 'Service trigger state unavailable.' } }
    } catch { $notes += 'Service trigger state unavailable.' }
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
}
$result | ConvertTo-Json -Depth 6 -Compress
