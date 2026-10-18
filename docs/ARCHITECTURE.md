# Arsitektur

## Gambaran umum

```
+-------------------+        stdout (JSON per baris)        +------------------+
|  media.ps1        | -------------------------------------> |                  |
|  (PowerShell)     |                                        |   main.js        |
|  mode watch       | <------------------------------------- |   (Electron main)|
|  mode cmd         |        stdin (toggle, next, seek)      |                  |
+-------------------+                                        +--------+---------+
                                                                      | IPC (preload.js)
                                                      +---------------+----------------+
                                                      |                                |
                                              +-------v-------+                +-------v--------+
                                              | Jendela pulau |                | Jendela        |
                                              | index.html    |                | Pengaturan     |
                                              +---------------+                +----------------+
                                                      |
                                              store.js (pulau-data.json di AppData)
```

## Komponen

### Proses utama (`main.js`)

* Membuat jendela pulau: tanpa bingkai, transparan, selalu di atas, tanpa ikon *taskbar*, ditempatkan di tengah atas monitor utama.
* **Deteksi kursor:** jendela dibiarkan menembus klik (`setIgnoreMouseEvents(true, { forward: true })`). Posisi kursor dibaca tiap 40 ms dari sistem dan dibandingkan dengan area kapsul yang dilaporkan antarmuka. Saat kursor masuk, jendela mulai menerima klik. Cara ini tetap bekerja ketika pengguna menyeret file.
* Menjalankan dua proses PowerShell dan meneruskan datanya ke antarmuka.
* Menangani IPC: penyimpanan, dialog file, ikon file, `startDrag`, *autostart*, membuka folder data.
* Membuat ikon *tray* dan jendela Pengaturan.

### Jembatan Windows (`media.ps1`)

Dua mode agar pembacaan tidak tertahan oleh perintah masuk.

| Mode | Fungsi |
| --- | --- |
| `watch` | Memantau sesi media (SMTC) tiap 600 ms: judul, artis, album, status, posisi, durasi, sampul. Memantau Caps Lock dan volume (Core Audio via COM) tiap 200 ms. Mengirim JSON per baris. |
| `cmd` | Membaca perintah dari stdin: `toggle`, `next`, `prev`, `seek <detik>`. |

Jenis pesan: `state` (status musik), `track` (sampul), `sys` (Caps Lock dan volume). Sampul dibaca dengan empat cara berurutan (`AsStreamForRead` lewat refleksi, `AsStream`, dua varian `DataReader`) dan dicoba hingga sepuluh kali karena beberapa pemutar mengirim gambar terlambat. Setiap kegagalan dicatat di log. Bila tetap kosong, proses utama mencari sampul di iTunes Search (`art-lookup`) dan mengembalikannya sebagai data URI agar CSP tetap ketat. Proses berhenti sendiri bila proses induk hilang.

### Mode notch (`appbar.js`)

Windows menyediakan mekanisme *AppBar* (`SHAppBarMessage` di `shell32.dll`) yang dipakai *taskbar*. Pulau memanggilnya lewat koffi, tanpa kompilasi native:

1. `ABM_NEW` mendaftarkan jendela pulau sebagai AppBar di tepi atas (`ABE_TOP`).
2. `ABM_QUERYPOS` lalu `ABM_SETPOS` mencadangkan persegi selebar layar setinggi bilah (piksel fisik, dari `screen.dipToScreenRect`). Windows mengecilkan *work area*, jadi jendela yang dimaksimalkan mulai di bawah bilah.
3. `hookWindowMessage` menerima `ABN_POSCHANGED` (daftar ulang posisi) dan `ABN_FULLSCREENAPP` (sembunyikan pulau saat ada aplikasi layar penuh).
4. Pesan `TaskbarCreated` ditangkap agar AppBar didaftarkan ulang setelah Explorer dimulai ulang.
5. `ABM_REMOVE` dipanggil saat keluar atau saat mode dimatikan.

Jendela pulau dibuat selebar layar. Bilah hitam digambar di antarmuka (`#bar`), sedangkan area di luar kapsul tetap tembus klik.

### Bilah menu (`desktop.js`, `renderer/js/menubar.js`)

Proses utama memeriksa lingkungan tiap 1 detik lalu mengirim pesan `env` hanya bila ada perubahan. Setiap data hanya dibaca bila pengaturan memakainya; dengan Ikuti tema sistem, efek Padat, dan nama aplikasi mati, tidak ada panggilan Windows sama sekali.

| Data | Sumber |
| --- | --- |
| Aplikasi aktif dan judul | `GetForegroundWindow`, `GetWindowTextW`, `QueryFullProcessImageNameW`. Nama exe di-cache per PID (maksimal 64) dan *buffer* dipakai ulang. Kelas `Progman` atau `WorkerW` berarti desktop. *Taskbar*, Start, Alt+Tab, dan jendela Pulau sendiri diabaikan. |
| Warna jendela aktif | Batas jendela dari `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)`, lalu satu `BitBlt` selebar jendela setinggi 1 piksel, 4 piksel di bawah bilah atau di bawah tepi atas jendela. Warna dikelompokkan 3 bit per kanal; kelompok terbanyak beserta 26 tetangganya dirata-ratakan, jadi latar bergradasi (Word, Office) tetap terbaca dan teks atau ikon tidak menggeser hasil. Bila tidak ada pemenang yang jelas (foto, video), dipakai median tiap kanal. Alasan setiap kegagalan dicatat di log. |
| Warna wallpaper | `SystemParametersInfoW(SPI_GETDESKWALLPAPER)`, cadangan `TranscodedWallpaper`. Rata-rata 10 persen bagian atas gambar, dihitung ulang hanya bila file berubah. |
| Tema gelap atau terang | `nativeTheme.shouldUseDarkColors` |
| Wi-Fi | `netsh wlan show interfaces` tiap 10 detik di PowerShell |

Bila jendela aktif tidak ada di bawah bilah (misalnya di monitor lain atau diminimalkan), yang dibaca adalah piksel tepat di bawah bilah di monitor utama.

Jadwal pembacaan warna jendela: 250 ms setelah fokus atau judul berubah, sekali lagi 900 ms kemudian (jendela baru sering masih beranimasi), lalu paling sering tiap 8 detik selama jendela yang sama aktif. Tidak dilakukan saat pulau terbuka atau tersembunyi. Semua objek GDI (`GetDC`, DC memori, *bitmap*) dilepas di blok `finally`, jadi tidak ada kebocoran *handle*.

Versi 0.4.0 memakai 20 panggilan `GetPixel` tiap 1,4 detik. Setiap `GetPixel` pada layar memaksa salinan dari GPU ke CPU, jadi biayanya 20 kali lipat satu `BitBlt` dan berjalan terus-menerus. Itu penyebab lag yang dilaporkan.

Pengaturan bilah dipisah dua: sumber warna `barColor` (`auto` atau `system`) dan efek `barEffect` (`solid`, `blur`, `transparent`). Warna teks hitam atau putih dipilih dari luminans relatif (WCAG) dari apa yang benar-benar terlihat: warna latar untuk Padat, campuran wallpaper dan tinta untuk Blur, wallpaper untuk Transparan.

### Efek blur bilah

Versi 0.4.1 sampai 0.4.6 membuat jendela kedua dengan efek *acrylic* lewat `SetWindowCompositionAttribute`. Cara itu dibuang di 0.4.7 karena: Electron hanya mendukung material latar resmi di Windows 11 22H2 ke atas; jendela transparan dipaksa minimal 64x64 piksel oleh Electron/Chromium sehingga menutupi bagian atas jendela lain; pemotongan dengan `SetWindowRgn` tidak bisa dipastikan bekerja; dan jendela kedua memakai sekitar 86 MB.

Penggantinya memanfaatkan fakta bahwa area bilah dicadangkan AppBar, sehingga **di belakangnya hanya ada wallpaper**. Proses utama (`desktop.wallpaperStrip`) memotong irisan atas wallpaper sebesar bilah (mode *Fill*, dipusatkan), memperkecilnya menjadi sepertiga lebar layar, lalu mengirimnya sebagai data URI JPEG (beberapa KB) lewat IPC `bar-img`. Irisan dihitung ulang hanya bila berkas wallpaper, ukuran layar, atau tinggi bilah berubah. Antarmuka menampilkannya di `#barImg` dengan `filter: blur(r) saturate(1.5)` dan lapisan tinta `rgba` di atasnya. Dua pengaturan terpisah: **Kekuatan blur** (0 sampai 100% menjadi radius 0 sampai 30 px; pada 0% gambar tidak ditampilkan sama sekali sehingga bilah transparan) dan **Kepekatan warna** (alpha tinta; warna tinta adalah warna jendela aktif bila Otomatis, atau hitam atau putih tema sistem). Efek blur hanya berlaku saat desktop (Home) terlihat; saat ada jendela aktif, antarmuka memakai efek Padat dengan warna jendela itu, dan gambar blur tidak ditampilkan. Karena tinta terpisah dari blur, warna tetap berganti mengikuti jendela walau blur 0%. Tanpa jendela kedua, tanpa API Windows tak resmi, dan tanpa beban per bingkai. Keterbatasan: wallpaper mode *Fit*, *Center*, atau *Tile* sedikit bergeser dari aslinya (tidak terasa karena dikaburkan), dan jendela yang digeser pengguna ke bawah area bilah tidak ikut dikaburkan.

### Kinerja

* Antarmuka hanya menyentuh DOM bila isinya berubah: jam ditulis saat menit berganti, ikon bilah dan variabel warna dibandingkan dulu, *progress* musik berhenti diperbarui saat lagu dijeda.
* Antrean notifikasi dibatasi 8, cache sampul 40, cache nama exe 64, riwayat *undo* minum 20.
* `[kinerja]` di log tiap 10 menit: total memori (`app.getAppMetrics`), *heap* proses utama, dan CPU. Peringatan dicatat bila memori lebih dari dua kali lipat nilai awal.

### Log (`logger.js`)

Satu file `pulau.log`, level `off`, `errors` (WARN dan ERROR), `all` (DEBUG sampai ERROR). Sumber log: proses utama, antarmuka lewat IPC `log` serta `window.onerror`, dan PowerShell lewat pesan `{"type":"log"}` di stdout. File diputar ke `pulau.old.log` setelah 2 MB. Pengaturan menampilkan 400 baris terakhir lewat IPC `log-tail`.

### Penyimpanan (`store.js`)

Satu file JSON di `app.getPath('userData')`. Nilai bawaan digabung dengan isi file sehingga kunci baru pada versi berikutnya tidak merusak data lama. Penulisan ditunda 250 ms dan atomik (tulis ke file sementara lalu ganti nama).

Bagian data: `settings`, `todos`, `water`, `shelf`, `pomo`.

### Antarmuka (`renderer/`)

Tanpa kerangka kerja. Satu objek global `P` menampung state dan modul.

| Berkas | Tugas |
| --- | --- |
| `js/core.js` | Mode kapsul, ukuran, navigasi halaman, antrean notifikasi, jam, mata, laporan area kapsul. |
| `js/music.js` | State musik, sampul dan warna, lirik LRCLIB, *progress bar*. |
| `js/pomodoro.js` | Mesin timer berbasis waktu akhir (`endAt`) sehingga akurat dan tahan ditutup ulang. |
| `js/water.js` | Catatan per jam, grafik, pengingat. |
| `js/shelf.js` | Seret masuk lewat DOM, seret keluar lewat `startDrag` di proses utama. |
| `js/todo.js` | Daftar tugas dan pengingat jam. |
| `js/system.js` | Baterai (Battery API), perangkat audio (`enumerateDevices`), Caps Lock dan volume. |
| `js/boot.js` | Memuat data, memulai modul, menghubungkan IPC. |
| `js/settings.js` | Logika jendela Pengaturan. |

Setiap modul mengekspos antarmuka kecil: `title`, `width()`, `init()`, `onShow()`, `onData(key)`, `decorate(mode)`.

## Mode kapsul

| Mode | Ukuran | Pemicu |
| --- | --- | --- |
| `idle` | 150 x 32 | tidak ada aktivitas |
| `compact` | 340 x 38 | musik atau timer berjalan |
| `alert` | sesuai notifikasi | ada notifikasi di antrean |
| `expanded` | 560 sampai 800 x 190 | kursor di atas kapsul |

Urutan prioritas: `expanded`, `alert`, `compact`, `idle`. Transisi memakai CSS (`cubic-bezier` berpegas) dan sudut luar melengkung dibuat dengan `radial-gradient` supaya kapsul menyatu dengan tepi layar.

## Keamanan

* `contextIsolation: true`, `nodeIntegration: false`.
* CSP pada setiap halaman: sumber hanya dari aplikasi, koneksi hanya ke `https://lrclib.net`.
* Preload hanya mengekspos fungsi yang dibutuhkan.
* Teks dari pengguna dan pemutar selalu di-*escape* sebelum disisipkan ke HTML.

## Pembangunan

`electron-builder` menghasilkan *installer* NSIS. `media.ps1` disertakan sebagai `extraResources` karena PowerShell tidak dapat membaca skrip dari dalam arsip `asar`. GitHub Actions membangun di `windows-latest`.

## Keterbatasan teknis

* PowerShell menambah waktu mulai sekitar satu sampai dua detik dan konsumsi memori sekitar 40 MB per proses. Modul native adalah opsi perbaikan.
* Persentase baterai perangkat Bluetooth tidak tersedia lewat API yang dipakai.
