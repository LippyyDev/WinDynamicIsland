# Pulau: jembatan ke Windows.
#   -Mode watch : kirim status media + sistem (Caps Lock, volume) sebagai JSON per baris
#   -Mode cmd   : baca perintah dari stdin (toggle | next | prev | seek <detik>)
param([string]$Mode = 'watch', [int]$ParentPid = 0)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# Log dikirim ke proses utama lewat stdout, lalu disaring sesuai level di Pengaturan.
function LogMsg($m, [string]$Level = 'INFO') {
  try {
    [Console]::Out.WriteLine((@{ type = 'log'; level = $Level; msg = "$m" } | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
  } catch {}
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
} catch { LogMsg "init gagal: $_" "ERROR"; exit 1 }

function Await($op, [Type]$t) {
  $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op))
  $null = $task.Wait(5000)
  return $task.Result
}

try {
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  LogMsg "manager siap"
} catch { LogMsg "RequestAsync gagal: $_" "ERROR"; exit 1 }

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
    } catch { LogMsg "perintah '$line' gagal: $_" "WARN" }
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
} catch { LogMsg "audio tidak tersedia: $_" "WARN" }

# ---------------- mode watch ----------------
function Send($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

$script:miRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
$script:thumbNote = ''

function Root-Msg($ex) {
  while ($ex.InnerException) { $ex = $ex.InnerException }
  return $ex.Message
}

function Get-Mime($b) {
  if ($b.Length -ge 3 -and $b[0] -eq 0xFF -and $b[1] -eq 0xD8) { return 'image/jpeg' }
  if ($b.Length -ge 4 -and $b[0] -eq 0x89 -and $b[1] -eq 0x50) { return 'image/png' }
  if ($b.Length -ge 3 -and $b[0] -eq 0x47 -and $b[1] -eq 0x49) { return 'image/gif' }
  if ($b.Length -ge 2 -and $b[0] -eq 0x42 -and $b[1] -eq 0x4D) { return 'image/bmp' }
  if ($b.Length -ge 12 -and $b[0] -eq 0x52 -and $b[8] -eq 0x57) { return 'image/webp' }
  return 'image/png'
}

# Mencoba beberapa cara membaca stream gambar. Setiap kegagalan dicatat agar penyebabnya terlihat di log.
function Read-StreamBytes($rs) {
  $errs = New-Object System.Collections.Generic.List[string]

  # A: AsStreamForRead lewat refleksi (menghindari pemilihan overload PowerShell)
  try {
    if (-not $script:miRead) { throw 'AsStreamForRead tidak ditemukan' }
    $st = $script:miRead.Invoke($null, @($rs))
    $ms = New-Object System.IO.MemoryStream
    $st.CopyTo($ms); $st.Dispose()
    if ($ms.Length -gt 16) { return ,$ms.ToArray() }
    $errs.Add('A: kosong')
  } catch { $errs.Add('A: ' + (Root-Msg $_.Exception)) }

  # B: AsStream langsung
  try {
    $st = [System.IO.WindowsRuntimeStreamExtensions]::AsStream($rs)
    $ms = New-Object System.IO.MemoryStream
    $st.CopyTo($ms); $st.Dispose()
    if ($ms.Length -gt 16) { return ,$ms.ToArray() }
    $errs.Add('B: kosong')
  } catch { $errs.Add('B: ' + (Root-Msg $_.Exception)) }

  # C: DataReader (::new)
  try {
    $size = [uint32]$rs.Size
    if ($size -le 0) { throw 'ukuran 0' }
    $dr = [Windows.Storage.Streams.DataReader]::new($rs.GetInputStreamAt(0))
    $null = Await ($dr.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $dr.ReadBytes($bytes)
    if ($bytes.Length -gt 16) { return ,$bytes }
    $errs.Add('C: kosong')
  } catch { $errs.Add('C: ' + (Root-Msg $_.Exception)) }

  # D: DataReader (New-Object)
  try {
    $size = [uint32]$rs.Size
    if ($size -le 0) { throw 'ukuran 0' }
    $dr = New-Object Windows.Storage.Streams.DataReader -ArgumentList ($rs.GetInputStreamAt(0))
    $null = Await ($dr.LoadAsync($size)) ([uint32])
    $bytes = New-Object byte[] $size
    $dr.ReadBytes($bytes)
    if ($bytes.Length -gt 16) { return ,$bytes }
    $errs.Add('D: kosong')
  } catch { $errs.Add('D: ' + (Root-Msg $_.Exception)) }

  throw ($errs -join ' | ')
}

function Read-Thumb($props) {
  if (-not $props.Thumbnail) {
    $script:thumbNote = 'aplikasi belum atau tidak menyediakan thumbnail'
    return $null
  }
  $rs = Await ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  if (-not $rs) { throw 'OpenReadAsync menghasilkan null' }
  $bytes = Read-StreamBytes $rs
  try { $rs.Dispose() } catch {}
  return ('data:' + (Get-Mime $bytes) + ';base64,' + [Convert]::ToBase64String($bytes))
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
      LogMsg "sistem: capslock=$([Console]::CapsLock) volume=$vol" "DEBUG"
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
          $thumbTries = 10
          LogMsg "lagu: $key ($($s.SourceAppUserModelId))"
        }
        if ($thumbTries -gt 0) {
          $thumbTries--
          $thumb = $null
          $script:thumbNote = ''
          try { $thumb = Read-Thumb $props } catch { $script:thumbNote = 'gagal membaca: ' + (Root-Msg $_.Exception) }
          if ($thumb) {
            LogMsg ('thumbnail OK, ' + [math]::Round($thumb.Length / 1365) + ' KB')
            $thumbTries = 0
            Send @{ type = 'track'; key = $key; thumb = $thumb }
          } else {
            if ($thumbTries -eq 9) { Send @{ type = 'track'; key = $key; thumb = $null } }
            if ($thumbTries -eq 9 -or $thumbTries -eq 0) {
              $lv = 'INFO'; if ($script:thumbNote -like 'gagal*') { $lv = 'WARN' }
              LogMsg ('thumbnail: ' + $script:thumbNote) $lv
            }
          }
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
      if ($errCount -le 5) { LogMsg "loop error: $_" "WARN" }
    }
  }
  Start-Sleep -Milliseconds 200
}
