# Pulau: jembatan ke Windows.
#   -Mode watch : kirim status media + sistem (Caps Lock, volume) sebagai JSON per baris
#   -Mode cmd   : baca perintah dari stdin (toggle | next | prev | seek <detik>)
param([string]$Mode = 'watch', [string]$Log = '', [int]$ParentPid = 0)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function LogMsg($m) {
  if ($Log) { try { Add-Content -LiteralPath $Log -Value ("[{0}] [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Mode, $m) } catch {} }
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
} catch { LogMsg "init gagal: $_"; exit 1 }

function Await($op, [Type]$t) {
  $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op))
  $null = $task.Wait(5000)
  return $task.Result
}

try {
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  LogMsg "manager siap"
} catch { LogMsg "RequestAsync gagal: $_"; exit 1 }

# ---------------- mode perintah ----------------
if ($Mode -eq 'cmd') {
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { exit }
    try {
      $s = $mgr.GetCurrentSession()
      if (-not $s) { continue }
      $p = $line.Trim().Split(' ')
      switch ($p[0]) {
        'toggle' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        'next'   { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        'prev'   { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
        'seek'   {
          $ticks = [long]([double]::Parse($p[1], [Globalization.CultureInfo]::InvariantCulture) * 10000000)
          $null = Await ($s.TryChangePlaybackPositionAsync($ticks)) ([bool])
        }
      }
    } catch { LogMsg "perintah '$line' gagal: $_" }
  }
}

# ---------------- volume (Core Audio) ----------------
$audioOk = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class PulauAudio {
  static IAudioEndpointVolume Vol() {
    var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out epv));
    return epv;
  }
  public static string State() {
    var v = Vol(); float lvl; bool mute;
    Marshal.ThrowExceptionForHR(v.GetMasterVolumeLevelScalar(out lvl));
    Marshal.ThrowExceptionForHR(v.GetMute(out mute));
    return ((int)Math.Round(lvl * 100)).ToString() + (mute ? "m" : "");
  }
}
'@
  $audioOk = $true
} catch { LogMsg "audio tidak tersedia: $_" }

# ---------------- mode watch ----------------
function Send($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Read-Thumb($props) {
  if (-not $props.Thumbnail) { return $null }
  $rs = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $ct = $rs.ContentType; if (-not $ct) { $ct = 'image/png' }
  $bytes = $null
  try {
    $st = [System.IO.WindowsRuntimeStreamExtensions]::AsStream($rs)
    $ms = New-Object System.IO.MemoryStream
    $st.CopyTo($ms)
    $bytes = $ms.ToArray()
  } catch {
    $size = [uint32]$rs.Size
    $dr = New-Object Windows.Storage.Streams.DataReader -ArgumentList ($rs.GetInputStreamAt(0))
    $null = Await ($dr.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $dr.ReadBytes($bytes)
  }
  if (-not $bytes -or $bytes.Length -lt 16) { return $null }
  return "data:$ct;base64," + [Convert]::ToBase64String($bytes)
}

$lastKey = $null
$thumbTries = 0
$errCount = 0
$tick = 0
$lastSys = ''

while ($true) {
  $tick++
  if ($ParentPid -gt 0 -and ($tick % 25) -eq 0 -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { exit }

  # sistem: tiap tick (200 ms)
  try {
    $vol = ''
    if ($audioOk) { try { $vol = [PulauAudio]::State() } catch { $vol = '' } }
    $sys = "$([Console]::CapsLock)|$vol"
    if ($sys -ne $lastSys) {
      $lastSys = $sys
      $v = -1; $mute = $false
      if ($vol) { $mute = $vol.EndsWith('m'); $v = [int]($vol.TrimEnd('m')) }
      Send @{ type = 'sys'; caps = [Console]::CapsLock; vol = $v; mute = $mute }
    }
  } catch {}

  # media: tiap 3 tick (600 ms)
  if (($tick % 3) -eq 1) {
    try {
      $s = $mgr.GetCurrentSession()
      if (-not $s) {
        $lastKey = $null
        Send @{ type = 'state'; none = $true }
      } else {
        $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
        $tl = $s.GetTimelineProperties()
        $status = $s.GetPlaybackInfo().PlaybackStatus.ToString()
        $dur = ($tl.EndTime - $tl.StartTime).TotalSeconds
        $pos = $tl.Position.TotalSeconds
        if ($status -eq 'Playing') { $pos += ([DateTimeOffset]::Now - $tl.LastUpdatedTime).TotalSeconds }
        if ($dur -gt 0 -and $pos -gt $dur) { $pos = $dur }
        if ($pos -lt 0) { $pos = 0 }
        $title = "$($props.Title)"
        $key = "$title|$($props.Artist)"
        if ($key -ne $lastKey) {
          $lastKey = $key
          $thumbTries = 8
          LogMsg "lagu: $key ($($s.SourceAppUserModelId))"
        }
        if ($thumbTries -gt 0) {
          $thumbTries--
          $thumb = $null
          try { $thumb = Read-Thumb $props } catch { if ($thumbTries -eq 0) { LogMsg "thumbnail gagal: $_" } }
          if ($thumb) { $thumbTries = 0; Send @{ type = 'track'; key = $key; thumb = $thumb } }
          elseif ($thumbTries -eq 7) { Send @{ type = 'track'; key = $key; thumb = $null } }
        }
        if (-not $title) {
          Send @{ type = 'state'; none = $true }
        } else {
          Send @{
            type = 'state'; none = $false
            title = $title; artist = "$($props.Artist)"; album = "$($props.AlbumTitle)"
            app = "$($s.SourceAppUserModelId)"; status = $status
            pos = [math]::Round($pos, 2); dur = [math]::Round($dur, 2)
          }
        }
      }
      $errCount = 0
    } catch {
      $errCount++
      if ($errCount -le 5) { LogMsg "loop error: $_" }
    }
  }
  Start-Sleep -Milliseconds 200
}
