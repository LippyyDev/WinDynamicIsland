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
