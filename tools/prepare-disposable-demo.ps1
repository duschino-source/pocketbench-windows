param([switch]$Restore)
$ErrorActionPreference='Stop'
$model=[string](Get-CimInstance Win32_ComputerSystem).Model
if($env:POCKETBENCH_DISPOSABLE_VM -ne '1' -or ($model -notmatch 'Virtual Machine|VMware|VirtualBox|QEMU|KVM|Parallels' -and $env:USERNAME -ne 'WDAGUtilityAccount')) {
  throw 'Demo fault preparation is restricted to an explicitly authorized disposable VM. No settings were changed.'
}
$directory=Join-Path $env:LOCALAPPDATA 'PocketBenchDemo'
$stateFile=Join-Path $directory 'original-state.json'
$proxyPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
if($Restore) {
  if(-not(Test-Path -LiteralPath $stateFile)){throw 'No saved demo state was found.'}
  $state=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  if($state.proxy.hasEnable){Set-ItemProperty -LiteralPath $proxyPath -Name ProxyEnable -Value ([int]$state.proxy.enable) -Type DWord}else{Remove-ItemProperty -LiteralPath $proxyPath -Name ProxyEnable -ErrorAction SilentlyContinue}
  if($state.proxy.hasServer){Set-ItemProperty -LiteralPath $proxyPath -Name ProxyServer -Value ([string]$state.proxy.server)}else{Remove-ItemProperty -LiteralPath $proxyPath -Name ProxyServer -ErrorAction SilentlyContinue}
  if($state.service.status -ne 'Running'){Stop-Service W32Time -Force -ErrorAction SilentlyContinue}
  $start=if($state.service.start -eq 'Auto'){'Automatic'}elseif($state.service.start -eq 'Disabled'){'Disabled'}else{'Manual'}
  Set-Service W32Time -StartupType $start
  if($state.service.status -eq 'Running'){Start-Service W32Time}
  if($state.firefoxFile){[IO.File]::WriteAllBytes([string]$state.firefoxFile,[Convert]::FromBase64String([string]$state.firefoxBefore))}
  Write-Output 'Saved VM state restored. Discard the VM after recording.'
  return
}
if(Test-Path -LiteralPath $stateFile){throw 'Existing demo state found. Restore it before preparing another demo.'}
if(Get-Process firefox -ErrorAction SilentlyContinue){throw 'Close Firefox before preparing the disposable demo.'}
$proxy=Get-ItemProperty -LiteralPath $proxyPath
$service=Get-CimInstance Win32_Service -Filter "Name='W32Time'"
$profiles=Join-Path $env:APPDATA 'Mozilla\Firefox\Profiles'
$prefs=@(Get-ChildItem -LiteralPath $profiles -Directory -ErrorAction SilentlyContinue | ForEach-Object {Join-Path $_.FullName 'prefs.js'} | Where-Object {Test-Path -LiteralPath $_})
if($prefs.Count -ne 1){throw 'This demo requires exactly one fresh Firefox profile. Launch Firefox once in the fresh VM, close it, then retry.'}
$state=[pscustomobject]@{
  proxy=[pscustomobject]@{hasEnable=($null -ne $proxy.ProxyEnable);enable=$proxy.ProxyEnable;hasServer=($null -ne $proxy.ProxyServer);server=$proxy.ProxyServer}
  service=[pscustomobject]@{status=$service.State;start=$service.StartMode}
  firefoxFile=$prefs[0];firefoxBefore=[Convert]::ToBase64String([IO.File]::ReadAllBytes($prefs[0]))
}
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$state | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $stateFile -Encoding UTF8
Set-ItemProperty -LiteralPath $proxyPath -Name ProxyEnable -Value 1 -Type DWord
Set-ItemProperty -LiteralPath $proxyPath -Name ProxyServer -Value '127.0.0.1:9'
Set-Service W32Time -StartupType Manual
Stop-Service W32Time -Force
$text=[IO.File]::ReadAllText($prefs[0])
$text=[regex]::Replace($text,'(?m)^\s*user_pref\("network\.proxy\.(type|http|http_port)",[^\r\n]+\);\s*$','')
$text += "`nuser_pref(`"network.proxy.type`", 1);`nuser_pref(`"network.proxy.http`", `"127.0.0.1`");`nuser_pref(`"network.proxy.http_port`", 9);`n"
[IO.File]::WriteAllText($prefs[0],$text,[Text.UTF8Encoding]::new($false))
Write-Output 'Disposable VM faults prepared: stale Windows proxy, stopped time service, and stale Firefox proxy. Original state was saved.'
