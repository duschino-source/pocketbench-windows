# PocketBench read-only Windows scan. No system state is modified.
$ErrorActionPreference = 'Stop'

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
foreach ($name in $selectedServices) {
  try {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($null -eq $svc) { continue }
    $startType = ''
    try {
      $cim = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $name + "'") -ErrorAction SilentlyContinue
      if ($cim) { $startType = [string]$cim.StartMode }
    } catch { }
    $services += [pscustomobject]@{
      name = $svc.Name
      displayName = [string]$svc.DisplayName
      status = [string]$svc.Status
      startType = $startType
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
