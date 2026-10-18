# PRD: Pulau (WinDynamicIsland)

| | |
| --- | --- |
| Versi dokumen | 1.0 |
| Status | Draf, selaras dengan rilis 0.2.0 |
| Pemilik | LIP (Muhammad Alif Qadri) |
| Platform | Windows 10 dan 11 (x64) |

## 1. Ringkasan

Pulau adalah aplikasi *overlay* ringan yang menampilkan kapsul seperti *Dynamic Island* di tepi atas layar Windows. Kapsul ini menjadi pusat kecil untuk kontrol musik, fokus kerja, dan notifikasi singkat, tanpa membuka jendela aplikasi terpisah.

## 2. Latar belakang dan masalah

* Windows tidak punya area ringkas yang selalu terlihat untuk informasi sesaat seperti lagu yang diputar, volume, atau pengisian daya.
* Kontrol media bawaan tersembunyi di *taskbar* dan tidak menampilkan lirik.
* Pengguna yang bekerja lama di depan layar membutuhkan pengingat ringan (fokus, minum, tugas) yang tidak mengganggu.
* Alternatif yang ada sebagian besar belum dirilis, berbayar, atau menyimpan data di luar perangkat pengguna.

## 3. Tujuan

1. Memberi tampilan *island* yang rapi, halus, dan terasa asli di Windows.
2. Menyatukan musik, lirik, Pomodoro, minum, rak file, tugas, dan notifikasi sistem dalam satu kapsul.
3. Menyimpan seluruh data secara lokal.
4. Mudah dipasang lewat satu *installer* `.exe`.

### Bukan tujuan (versi ini)

* Dukungan macOS dan Linux.
* Sinkronisasi antarperangkat atau akun pengguna.
* Dukungan beberapa monitor dan kapsul yang bisa digeser.
* Pengendali kecerahan layar dan Wi-Fi.

## 4. Pengguna sasaran

| Persona | Kebutuhan |
| --- | --- |
| Mahasiswa dan pekerja *remote* | Menjaga fokus dengan Pomodoro, mencatat tugas harian, ingat minum. |
| Pendengar musik di PC | Kontrol cepat dan lirik tanpa berpindah jendela. |
| Penggemar kustomisasi desktop | Tampilan modern dan animasi halus di Windows. |

## 5. Kebutuhan fungsional

Prioritas: **P0** wajib, **P1** penting, **P2** tambahan.

### 5.1 Kapsul dan perilaku

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| F-01 | Kapsul menempel di tengah atas monitor utama, selalu di atas jendela lain, tanpa ikon di *taskbar*. | P0 |
| F-02 | Empat mode: *idle* (jam), *compact* (ada aktivitas), *alert* (notifikasi), *expanded* (dibuka dengan kursor). | P0 |
| F-03 | Mode *expanded* terbuka saat kursor diarahkan ke kapsul dan menutup saat kursor pergi. | P0 |
| F-04 | Area di luar kapsul tidak boleh menghalangi klik ke aplikasi di bawahnya. | P0 |
| F-05 | Navigasi halaman lewat panah, titik, dan *scroll*. | P0 |
| F-06 | Saat tidak aktif, jam berganti mata yang mengikuti kursor (dapat dimatikan). | P2 |

### 5.2 Musik

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| M-01 | Membaca judul, artis, album, sampul, posisi, dan durasi dari sesi media Windows. | P0 |
| M-02 | Putar atau jeda, lagu berikutnya, lagu sebelumnya, dan geser posisi lewat *progress bar*. | P0 |
| M-03 | Lirik tersinkron dari LRCLIB, klik baris untuk lompat. | P1 |
| M-04 | Baris lirik aktif tampil pada mode *compact*. | P2 |
| M-05 | Warna latar mengikuti sampul album. | P1 |

### 5.3 Produktivitas

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| P-01 | Pomodoro dengan fokus, istirahat pendek, istirahat panjang, mulai, jeda, ulang, lewati. | P0 |
| P-02 | Durasi, jumlah sesi, bunyi, dan lanjut otomatis dapat diatur. | P1 |
| P-03 | Timer Pomodoro tetap tampil di mode *compact* saat berjalan dan tahan ditutup ulang aplikasi. | P1 |
| P-04 | Catatan minum per jam, target harian, grafik 8 jam terakhir, batalkan minum terakhir. | P0 |
| P-05 | Pengingat minum berkala pada jam aktif, berhenti saat target tercapai. | P1 |
| P-06 | Daftar tugas: tambah, selesai, ubah, hapus, jam pengingat. Tugas selesai dibersihkan hari berikutnya. | P0 |
| P-07 | Rak file: seret masuk, seret keluar, buka, tampilkan di folder, hapus dari rak. | P1 |

### 5.4 Notifikasi sistem

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| N-01 | Pengisi daya tersambung atau terlepas, dengan persentase baterai. | P1 |
| N-02 | Peringatan baterai lemah pada batas yang bisa diatur. | P1 |
| N-03 | Perangkat audio (headphone, speaker) terhubung atau terputus. | P1 |
| N-04 | Caps Lock aktif atau mati. | P2 |
| N-05 | Perubahan volume dan senyap. | P2 |
| N-06 | Setiap jenis notifikasi dapat dimatikan. | P0 |

### 5.5 Pengaturan dan data

| ID | Kebutuhan | Prioritas |
| --- | --- | --- |
| S-01 | Jendela Pengaturan dengan kategori Umum, Musik, Pomodoro, Minum Air, Notifikasi, Data. | P0 |
| S-02 | Perubahan pengaturan berlaku langsung tanpa memulai ulang. | P0 |
| S-03 | Menu *tray*: pengaturan, tampil atau sembunyi, *autostart*, buka log, keluar. | P0 |
| S-04 | Seluruh data disimpan lokal dalam satu file JSON, dengan opsi membuka folder dan menghapus semua data. | P0 |
| S-05 | *Autostart* menyala pada jalankan pertama dan dapat dimatikan. | P1 |

## 6. Kebutuhan non fungsional

* **Performa:** penggunaan CPU saat *idle* rendah (target di bawah 2 persen pada PC kelas menengah), animasi 60 fps pada transisi kapsul.
* **Privasi:** tanpa analitik dan tanpa akun. Satu-satunya akses jaringan adalah pencarian lirik.
* **Keandalan:** proses PowerShell dimulai ulang otomatis bila berhenti, dan berhenti sendiri bila aplikasi utama tertutup.
* **Keamanan:** `contextIsolation` aktif, `nodeIntegration` nonaktif, CSP ketat pada seluruh halaman.
* **Kegunaan:** antarmuka berbahasa Indonesia, font Plus Jakarta Sans.
* **Distribusi:** satu *installer* NSIS untuk pengguna tunggal tanpa hak administrator.

## 7. Alur utama

1. **Mendengarkan musik:** lagu diputar di Spotify, kapsul melebar menampilkan sampul dan baris lirik, kursor diarahkan membuka pemutar lengkap.
2. **Sesi fokus:** buka halaman Pomodoro, tekan mulai, tutup. Sisa waktu terlihat di kapsul. Saat selesai muncul notifikasi dan bunyi.
3. **Memindahkan file:** seret file ke kapsul, rak terbuka otomatis, file disimpan. Nanti seret keluar ke jendela lain.

## 8. Metrik keberhasilan

Karena aplikasi ini tanpa telemetri, keberhasilan dinilai lewat umpan balik terbuka.

* Pemasangan dan penggunaan pertama selesai tanpa membaca dokumentasi.
* Laporan *bug* terkait pembacaan musik menurun di tiap rilis.
* Jumlah bintang, *issue*, dan kontribusi di GitHub.

## 9. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| API kontrol media berbeda antar versi Windows atau pemutar | Musik tidak terbaca | Log media, pencatatan galat, bantuan pada README. |
| PowerShell diblokir kebijakan perangkat | Musik dan notifikasi sistem mati | Jalankan dengan `-ExecutionPolicy Bypass` dan dokumentasikan. Rencana jangka panjang: modul native. |
| *Installer* tanpa tanda tangan memicu SmartScreen | Pengguna ragu memasang | Jelaskan pada README, pertimbangkan sertifikat penandatangan. |
| Layanan LRCLIB tidak tersedia | Lirik kosong | Pesan "Lirik tidak tersedia", fitur lain tidak terpengaruh. |
| Kemiripan dengan produk lain | Masalah hak cipta atau merek | Nama, ikon, dan aset dibuat sendiri. Tidak memakai aset pihak lain. |

## 10. Rilis

| Versi | Isi |
| --- | --- |
| 0.1 | Kapsul, jam, musik, lirik. |
| 0.2 | Halaman Pomodoro, Minum, Rak File, Tugas, notifikasi sistem, pengaturan, penyimpanan lokal, font Jakarta. |
| Berikutnya | Lihat [ROADMAP.md](ROADMAP.md). |

## 11. Pertanyaan terbuka

* Apakah perlu dukungan banyak monitor dan posisi kapsul yang bisa diatur?
* Apakah perlu modul native untuk menggantikan PowerShell demi kecepatan dan keandalan?
* Apakah perlu tanda tangan digital sejak rilis publik pertama?
