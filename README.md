# Pulau (WinDynamicIsland)

*Dynamic Island* untuk Windows 10 dan 11. Sebuah kapsul hitam di tengah atas layar yang menampilkan pemutar musik dengan lirik tersinkron, timer Pomodoro, pengingat minum, rak file, daftar tugas, dan notifikasi sistem. Semua data tersimpan di PC sendiri, tanpa akun dan tanpa server.

> Status: versi 0.2.0 (awal). Dibuat dengan Electron. Bagian yang membaca musik dan sistem dari Windows belum diuji pada banyak perangkat, jadi laporan *bug* sangat membantu.

## Fitur

| Fitur | Keterangan |
| --- | --- |
| Musik | Membaca lagu dari Spotify, YouTube di *browser*, dan pemutar lain lewat kontrol media Windows (SMTC). Sampul album, *progress bar* yang bisa diklik, putar, jeda, maju, mundur. |
| Lirik | Lirik tersinkron dari [LRCLIB](https://lrclib.net). Klik satu baris untuk lompat ke bagian itu. Baris yang sedang dinyanyikan juga tampil di kapsul kecil. |
| Warna dinamis | Latar pemutar bergradasi mengikuti warna sampul album. |
| Pomodoro | Fokus, istirahat pendek, istirahat panjang. Durasi, jumlah sesi, bunyi, dan lanjut otomatis bisa diatur. Sisa waktu tampil di kapsul kecil. |
| Minum Air | Catatan per jam, target harian, grafik, dan pengingat berkala pada jam aktif. |
| Rak File | Seret file ke pulau, seret keluar ke aplikasi lain. Hanya menyimpan lokasi file. |
| Daftar Tugas | Tugas harian dengan pengingat jam. Klik dua kali untuk mengubah teks. |
| Notifikasi sistem | Pengisi daya, baterai lemah, *headphone* atau *speaker* terhubung, Caps Lock, volume. |
| Mata saat diam | Setelah beberapa saat tanpa aktivitas, jam berganti sepasang mata yang mengikuti kursor. |
| Mode *notch* | Area atas layar dicadangkan seperti *notch* MacBook, jadi jendela yang dimaksimalkan tidak tertutup pulau. Bilah hitam penuh, tinggi bilah dapat diatur, pulau otomatis sembunyi saat layar penuh. |
| Bilah menu | Seperti macOS: logo dengan menu cepat, aplikasi aktif dan judul jendela di kiri, Wi-Fi, volume, baterai, tanggal dan jam di kanan. Warna bilah: Otomatis (wallpaper saat di desktop, menyatu dengan aplikasi aktif), Wallpaper, Ikuti tema sistem, Hitam, Transparan, dengan opsi dipadukan tema gelap atau terang. |
| Log aktivitas | Tiga level: Mati, Hanya galat, Semua aktivitas. Ada penampil log di Pengaturan. |
| Pengaturan | Jendela khusus untuk semua opsi, termasuk menyalakan atau mematikan tiap halaman. |

Dokumen kebutuhan produk ada di [docs/PRD.md](docs/PRD.md), rancangan teknis di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tampilan

Gambar di bawah dibuat dengan data contoh.

![Bilah menu dengan berbagai tema](docs/screenshots/bilah-menu.png)
![Mode notch](docs/screenshots/notch.png)
![Musik dan lirik](docs/screenshots/musik.png)
![Pomodoro](docs/screenshots/pomodoro.png)
![Minum Air](docs/screenshots/minum.png)
![Rak File](docs/screenshots/rak-file.png)
![Daftar Tugas](docs/screenshots/tugas.png)
![Notifikasi](docs/screenshots/notifikasi.png)
![Pengaturan](docs/screenshots/pengaturan.png)

## Instalasi

1. Buka halaman [Releases](../../releases) atau tab **Actions**, lalu unduh `Pulau Setup x.y.z.exe`.
2. Jalankan *installer*. Jika muncul peringatan Windows SmartScreen, klik **More info** lalu **Run anyway**. Peringatan ini muncul karena *installer* belum ditandatangani secara digital.
3. Pulau berjalan otomatis dan muncul di tengah atas layar. Pengaturan ada di ikon *system tray*.

Persyaratan: Windows 10 atau 11 (64 bit). Lirik dan sampul cadangan membutuhkan internet. Fitur lain bekerja sepenuhnya luring.

## Cara pakai

* Arahkan kursor ke kapsul untuk membukanya. Geser halaman dengan panah kiri kanan, titik di bawah, atau *scroll*.
* Klik ikon gerigi di pojok kanan atas, atau klik ikon *tray*, untuk membuka Pengaturan.
* Klik kanan ikon *tray* untuk menampilkan atau menyembunyikan pulau, mengatur *autostart*, membuka log, atau keluar.

## Pengembangan

Prasyarat: Node.js 20 atau lebih baru, dan Windows untuk menjalankan fitur musik serta notifikasi sistem.

```bash
npm install
npm start          # jalankan dalam mode pengembangan
npm run dist       # bangun installer di folder dist/
```

Di Linux atau macOS, antarmuka tetap bisa dibuka untuk pengerjaan tampilan, tetapi data musik dan sistem tidak tersedia karena memakai PowerShell dan API Windows.

*Installer* juga dibangun otomatis oleh GitHub Actions (`.github/workflows/build.yml`) pada setiap *push*. Untuk membuat rilis, beri *tag* `v0.2.0` dan hasilnya terlampir di halaman Releases.

## Struktur proyek

```
main.js          proses utama Electron: jendela, tray, IPC, jembatan PowerShell
preload.js       API aman yang diekspos ke antarmuka
store.js         penyimpanan lokal (satu file JSON)
logger.js        pencatat aktivitas dan galat
appbar.js        mode notch lewat AppBar Windows (koffi + shell32)
desktop.js       aplikasi aktif, warna wallpaper, sampel warna di bawah bilah (koffi + user32/gdi32)
media.ps1        pembaca media, volume, dan Caps Lock Windows
renderer/        antarmuka pulau dan jendela pengaturan
  js/            modul per fitur (music, pomodoro, water, shelf, todo, system)
docs/            PRD, arsitektur, roadmap
```

## Data dan privasi

* Pengaturan, tugas, catatan minum, dan isi rak file disimpan di `%APPDATA%\Pulau\pulau-data.json`.
* Log disimpan di `%APPDATA%\Pulau\pulau.log` dan tidak pernah dikirim ke mana pun. Pada level Semua aktivitas, log memuat judul lagu dan teks tugas.
* Tidak ada akun, analitik, atau pelacakan.
* Permintaan jaringan hanya dua: pencarian lirik ke LRCLIB (judul, nama artis, nama album, durasi) dan, bila Windows tidak menyediakan sampul, pencarian sampul ke iTunes Search (judul dan nama artis). Pencarian sampul dapat dimatikan di Pengaturan, bagian Musik.

## Pemecahan masalah

* **Kapsul hanya menampilkan jam padahal musik diputar:** buka Pengaturan, bagian Data, ubah **Catat ke log** menjadi **Semua aktivitas**, ulangi masalahnya, lalu lampirkan isi log pada *issue*.
* **Jendela masih tertutup pulau:** pastikan **Potong layar seperti notch** aktif. Jendela yang sudah terbuka mungkin perlu dimaksimalkan ulang. Bila log berisi `AppBar tidak tersedia`, laporkan sebagai *issue*.
* **Area atas tetap kosong setelah Pulau ditutup paksa:** Windows biasanya memulihkannya sendiri. Bila tidak, buka lalu tutup Pulau dari menu *tray*, atau mulai ulang Explorer.
* **Sampul album tidak tampil:** buka log. Baris `thumbnail:` menjelaskan apakah pemutar tidak mengirim gambar atau gambar gagal dibaca. Pastikan juga **Cari sampul secara online** aktif di Pengaturan.
* **Pengingat atau notifikasi tidak muncul:** periksa pengaturan **Notifikasi**.
* **Peringatan SmartScreen:** lihat bagian Instalasi.

## Batasan yang diketahui

* Timer pada aplikasi Clock bawaan Windows tidak bisa dibaca aplikasi lain. Gunakan Pomodoro di Pulau.
* Persentase baterai *headphone* tidak tersedia, hanya status terhubung atau terputus.
* Kecerahan layar dan Wi-Fi belum didukung. Lihat [docs/ROADMAP.md](docs/ROADMAP.md).
* Pulau dan bilah notch hanya tampil di monitor utama.
* Saat mode *notch* aktif, bilah memakan seluruh lebar layar setinggi bilah, sama seperti bilah menu MacBook.

## Kontribusi

Lihat [CONTRIBUTING.md](CONTRIBUTING.md). Riwayat perubahan ada di [CHANGELOG.md](CHANGELOG.md).

## Lisensi

[MIT](LICENSE). Font Plus Jakarta Sans berlisensi SIL Open Font License. Proyek ini tidak berafiliasi dengan Apple maupun pembuat aplikasi sejenis.
