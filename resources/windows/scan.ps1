# PocketBench read-only Windows scan. No system state is modified.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Get-RegistryApps {
  $paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $apps = @()
  foreach ($path in $paths) {
    try {
      $keys = Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne '' }
      foreach ($k in $keys) {
        $rawId = ''
        try { $rawId = ($k.PSPath -split '\\')[-1] } catch { $rawId = $k.DisplayName }
        $apps += [pscustomobject]@{
          id = $rawId
          hive = if ($path.StartsWith('HKCU')) { 'HKCU' } else { 'HKLM' }
          name = [string]$k.DisplayName
          version = [string]$k.DisplayVersion
          publisher = [string]$k.Publisher
          installLocation = [string]$k.InstallLocation
          displayIcon = [string]$k.DisplayIcon
          uninstallString = [string]$k.UninstallString
        }
      }
    } catch { }
  }
  return $apps
}

function Get-StoreApps {
  # Current-user MSIX/Store inventory (read-only). No changes are made here.
  $out = @()
  try {
    $pkgs = Get-AppxPackage -PackageType Main -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -and $_.PackageFamilyName }
    foreach ($p in $pkgs) {
      $out += [pscustomobject]@{
        id = [string]$p.PackageFullName
        hive = 'Appx'
        name = [string]$p.Name
        version = [string]$p.Version
        publisher = [string]$p.Publisher
        installLocation = [string]$p.InstallLocation
        displayIcon = ''
        uninstallString = ''
      }
    }
  } catch { }
  return $out
}

function Get-StartupEntries {
  $entries = @()
  $hives = @(
    @{ hive = 'HKCU'; path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' },
    @{ hive = 'HKLM'; path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' }
  )
  foreach ($h in $hives) {
    try {
      $props = Get-ItemProperty -Path $h.path -ErrorAction SilentlyContinue
      if ($null -eq $props) { continue }
      foreach ($p in $props.PSObject.Properties) {
        if ($p.Name -like 'PS*') { continue }
        $entries += [pscustomobject]@{
          id = ($h.hive + '\Run\' + $p.Name)
          name = [string]$p.Name
          command = [string]$p.Value
          location = $h.path
          enabled = $true
        }
      }
    } catch { }
  }
  return $entries
}

$selectedServices = @('Dnscache','Dhcp','NlaSvc','W32Time','BITS','wuauserv','Winmgmt')
$services = @()
# One batched status query plus one batched start-mode query instead of a
# Get-Service + Get-CimInstance round trip per service. Output order and shape
# are unchanged: selected-service order, missing services skipped, empty
# startType when the start-mode lookup fails.
$svcByName = @{}
try { Get-Service -Name $selectedServices -ErrorAction SilentlyContinue | ForEach-Object { $svcByName[$_.Name] = $_ } } catch { }
$cimByName = @{}
try {
  $filter = ($selectedServices | ForEach-Object { "Name='$_'" }) -join ' OR '
  Get-CimInstance -ClassName Win32_Service -Filter $filter -ErrorAction SilentlyContinue | ForEach-Object { $cimByName[$_.Name] = [string]$_.StartMode }
} catch { }
if ($cimByName.Count -eq 0 -and $svcByName.Count -gt 0) {
  # Batched lookup returned nothing while services exist: retry per service
  # (original behavior) in case batched filtering is unsupported here.
  foreach ($name in $selectedServices) {
    try {
      $cim = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $name + "'") -ErrorAction SilentlyContinue
      if ($cim) { $cimByName[$name] = [string]$cim.StartMode }
    } catch { }
  }
}
foreach ($name in $selectedServices) {
  try {
    if (-not $svcByName.ContainsKey($name)) { continue }
    $svc = $svcByName[$name]
    $startType = ''
    if ($cimByName.ContainsKey($name)) { $startType = $cimByName[$name] }
    # Fixed read-only trigger query only. Read errors leave the value absent; absence never authorizes repair.
    $triggerStart = $null
    try {
      $triggerText = (& sc.exe qtriggerinfo $name 2>&1 | Out-String)
      if ($triggerText -match 'START SERVICE ON|STOP SERVICE ON') { $triggerStart = $true }
      elseif ($triggerText -match 'does not have any trigger|FAILED 1168|OpenService FAILED') { $triggerStart = $false }
    } catch { }
    $services += [pscustomobject]@{
      name = $svc.Name
      displayName = [string]$svc.DisplayName
      status = [string]$svc.Status
      startType = $startType
      triggerStart = $triggerStart
    }
  } catch { }
}

$proxyEnable = 0
$proxyServer = ''
try {
  $proxy = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
  if ($proxy) {
    $proxyEnable = [int]($proxy.ProxyEnable)
    $proxyServer = [string]$proxy.ProxyServer
  }
} catch { }

$os = $null
try { $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue } catch { }
$cs = $null
try { $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue } catch { }
$drive = $null
try { $drive = Get-PSDrive -Name C -ErrorAction SilentlyContinue } catch { }
$cpu = $null
try { $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue } catch { }

$uptime = 0
try {
  if ($os) { $uptime = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds }
} catch { }

$updateErrors = @()
try {
  $events = Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-WindowsUpdateClient/Operational'; Level=2; StartTime=(Get-Date).AddDays(-7) } -MaxEvents 3 -ErrorAction SilentlyContinue
  foreach ($event in $events) { $updateErrors += [pscustomobject]@{id=$event.Id;at=$event.TimeCreated.ToString('o');message=([string]$event.Message).Substring(0,[Math]::Min(1200,([string]$event.Message).Length))} }
} catch { }
$result = [pscustomobject]@{
  computerName = $env:COMPUTERNAME
  osCaption = if ($os) { [string]$os.Caption } else { 'Windows' }
  osVersion = if ($os) { [string]$os.Version } else { '' }
  memoryTotal = if ($os) { [long]$os.TotalVisibleMemorySize * 1024 } else { 0 }
  memoryFree = if ($os) { [long]$os.FreePhysicalMemory * 1024 } else { 0 }
  uptimeSeconds = $uptime
  cpuCount = if ($cpu) { [int](($cpu | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum) } else { 0 }
  cpuPercent = if ($cpu -and $null -ne @($cpu)[0].LoadPercentage) { [double](($cpu | Measure-Object -Property LoadPercentage -Average).Average) } else { $null }
  diskFree = if ($drive) { [long]$drive.Free } else { 0 }
  diskTotal = if ($drive) { [long]($drive.Free + $drive.Used) } else { 0 }
  proxyEnable = $proxyEnable
  proxyServer = $proxyServer
  apps = @(@(Get-RegistryApps) + @(Get-StoreApps))
  startup = @(Get-StartupEntries)
  services = @($services)
  updateErrors = @($updateErrors)
}

$result | ConvertTo-Json -Depth 6 -Compress
