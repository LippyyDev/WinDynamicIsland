# Changelog

Mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [Semantic Versioning](https://semver.org/lang/id/).

## [0.2.0] 2026-10-18

### Ditambahkan
- Halaman Pomodoro, Minum Air, Rak File, dan Daftar Tugas
- Notifikasi sistem: pengisi daya, baterai lemah, perangkat audio, Caps Lock, volume
- Jendela Pengaturan lengkap
- Mata animasi saat *idle*
- Penyimpanan lokal dalam satu file JSON
- Font Plus Jakarta Sans tertanam
- Navigasi halaman dengan panah, titik, dan *scroll*
- Alur GitHub Actions untuk membangun *installer*

### Diubah
- Tampilan kapsul dirapikan: sudut menyatu dengan tepi layar, *header*, ikon baterai, gradasi sampul
- Pembaca media dipisah menjadi dua proses (`watch` dan `cmd`)

### Diperbaiki
- Sampul album tidak tampil: tambah cadangan `DataReader` dan percobaan ulang
- Pembacaan musik macet pada PowerShell 5.1
- Perintah geser posisi gagal pada Windows dengan pemisah desimal koma

## [0.1.1] 2026-10-18

### Diperbaiki
- Musik tidak terbaca karena pembacaan stdin menahan seluruh skrip

## [0.1.0] 2026-10-18

### Ditambahkan
- Kapsul di tengah atas layar dengan jam
- Kontrol musik dan lirik tersinkron dari LRCLIB
- Warna latar mengikuti sampul album
- Ikon *tray* dan *autostart*
