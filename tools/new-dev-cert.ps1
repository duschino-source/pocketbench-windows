# Creates a THROWAWAY self-signed code-signing certificate for LOCAL testing only.
# It confers no public trust and must never be committed or used for releases.
# Output goes to .local/ (gitignored). Requires Windows PowerShell 5.1+.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$local = Join-Path $root '.local'
New-Item -ItemType Directory -Path $local -Force | Out-Null
$password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
$secure = ConvertTo-SecureString -String $password -AsPlainText -Force
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
  -Subject 'CN=PocketBench Local Test ONLY' `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3') `
  -NotAfter (Get-Date).AddDays(7) `
  -CertStoreLocation 'Cert:\CurrentUser\My'
$pfx = Join-Path $local 'dev-signing.pfx'
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure -Force | Out-Null
Remove-Item -LiteralPath ("Cert:\CurrentUser\My\" + $cert.Thumbprint) -Force
$passFile = Join-Path $local 'dev-signing-password.txt'
Set-Content -LiteralPath $passFile -Value $password -NoNewline
Write-Output "Wrote $pfx (expires in 7 days) and its password file."
Write-Output 'Local test only: $env:CSC_LINK="<that pfx>"; $env:CSC_KEY_PASSWORD=(Get-Content .local/dev-signing-password.txt -Raw); npm run dist'
Write-Output 'Never commit .local/ and never ship builds signed with this certificate.'
