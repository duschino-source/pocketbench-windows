$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PocketBenchStockIcon {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Info {
    public uint cbSize;
    public IntPtr hIcon;
    public int iSysImageIndex;
    public int iIcon;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string szPath;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern int SHGetStockIconInfo(uint id, uint flags, ref Info info);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
}
'@
$info = New-Object PocketBenchStockIcon+Info
$info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
# SIID_APPLICATION=2; SHGSI_ICON=0x100. Reads the generic program icon from this Windows installation.
$code = [PocketBenchStockIcon]::SHGetStockIconInfo(2, 0x100, [ref]$info)
if ($code -ne 0 -or $info.hIcon -eq [IntPtr]::Zero) { throw 'Windows program icon unavailable.' }
$icon = $null; $bitmap = $null; $stream = $null
try {
  $icon = [Drawing.Icon]::FromHandle($info.hIcon)
  $bitmap = $icon.ToBitmap()
  $stream = New-Object IO.MemoryStream
  $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
  @{ icon = 'data:image/png;base64,' + [Convert]::ToBase64String($stream.ToArray()) } | ConvertTo-Json -Compress
} finally {
  if ($stream) { $stream.Dispose() }
  if ($bitmap) { $bitmap.Dispose() }
  if ($icon) { $icon.Dispose() }
  [void][PocketBenchStockIcon]::DestroyIcon($info.hIcon)
}
