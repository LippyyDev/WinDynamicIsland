# Changelog

Mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [Semantic Versioning](https://semver.org/lang/id/).

## [0.5.0] 2026-10-19

### Ditambahkan
- Tampilan idle bisa dikustom: Jam, Tanggal, Teks kustom, Baterai, Napas, Gelombang, Titik kamera, Mata, atau Kosong
- Pilihan kedua "setelah lama diam" dengan jeda yang bisa diatur (bawaan: Mata, seperti sebelumnya)

### Diubah
- Saklar "Mata saat diam" diganti pilihan gaya; pengguna yang mematikannya otomatis dimigrasikan ke "Tidak berganti"
- Gaya idle yang tidak tampil memakai `display: none`, jadi animasinya benar benar berhenti dan tidak memakai GPU

## [0.4.9] 2026-10-18

### Diubah
- Efek Blur hanya berlaku saat desktop (Home) terlihat; saat ada jendela aktif, bilah memakai warna jendela itu secara Padat

## [0.4.8] 2026-10-18

### Diubah
- **Kekuatan blur** kini mengatur seberapa kabur wallpaper (0 sampai 100%); 0% berarti transparan tanpa kabur
- **Kepekatan warna** menjadi pengaturan terpisah untuk tinta warna bilah, sehingga warna tetap mengikuti jendela aktif walau blur 0%

## [0.4.7] 2026-10-18

### Diubah
- Efek Blur dibuat ulang: wallpaper di belakang bilah dikaburkan di antarmuka dan diberi tinta. Jendela latar kedua dan panggilan `SetWindowCompositionAttribute` dihapus

### Diperbaiki
- Strip blur menutupi bagian atas jendela lain (jendela transparan dipaksa minimal 64 piksel oleh Electron)
- Blur tidak tampak buram di Windows 10

### Kinerja
- Satu proses lebih sedikit saat Blur aktif (sekitar 86 MB)

## [0.4.6] 2026-10-18

### Diperbaiki
- Warna Otomatis gagal bila jendela aktif ada di monitor lain (lebar area negatif). Kini yang dibaca adalah piksel tepat di bawah bilah di monitor utama
- Jendela blur yang dipaksa Windows menjadi 64 piksel kini juga digeser ke atas layar sehingga kelebihannya tidak terlihat, selain dipotong

## [0.4.5] 2026-10-18

### Ditambahkan
- Log `[kinerja]` kini merinci memori per proses (jendela pulau, pengaturan, blur, GPU, dan lainnya)

## [0.4.4] 2026-10-18

### Diperbaiki
- Bilah blur setinggi dua kali bilah sebenarnya sehingga menutupi title bar jendela di bawahnya. Jendela blur kini dipotong tepat setinggi bilah dengan `SetWindowRgn` dan dibuat tanpa `thickFrame`
- Ukuran jendela blur sebenarnya dan skala layar dicatat di log

## [0.4.3] 2026-10-18

### Diperbaiki
- Warna Otomatis gagal pada jendela dengan latar bergradasi seperti Word, sehingga bilah jatuh ke warna cadangan (putih). Pengelompokan warna kini mencakup kelompok bertetangga dan memakai median bila tidak ada pemenang jelas
- Log `[bilah]` kini mencatat warna yang terbaca, alasan gagal, koordinat jendela, dan waktu baca

## [0.4.2] 2026-10-18

### Diubah
- Pengaturan bilah dipisah: **Warna bilah** (Otomatis mengikuti jendela aktif, atau Ikuti tema sistem) dan **Efek latar** (Padat, Blur, Transparan)
- Blur kini diwarnai warna jendela aktif bila warna Otomatis
- Pengaturan lama dipindahkan otomatis ke pasangan warna dan efek yang setara

### Ditambahkan
- Warna Otomatis kembali, kini dengan satu `BitBlt` selebar 1 piksel yang hanya dijalankan saat fokus atau judul berubah
- Catatan `[kinerja]` di log tiap 10 menit (memori, *heap*, CPU) dan peringatan bila memori naik lebih dari dua kali lipat

### Kinerja
- Jam, ikon bilah, dan variabel warna hanya ditulis ke DOM bila berubah
- *Progress* musik tidak diperbarui saat lagu dijeda
- Nama exe di-cache dan *buffer* Win32 dipakai ulang, jadi tidak ada alokasi tiap detik
- Antrean notifikasi dibatasi 8

## [0.4.1] 2026-10-18

### Ditambahkan
- Warna bilah **Blur**: tembus pandang dengan latar buram (acrylic), kepekatan dapat diatur di Pengaturan
- Warna bilah **Transparan** sungguhan, teks mengikuti wallpaper saat di desktop

### Diubah
- Pilihan warna bilah disederhanakan menjadi Ikuti tema sistem, Wallpaper, Transparan, dan Blur
- Ikuti tema sistem kini hitam murni saat Windows gelap dan putih murni saat terang
- Pembaruan lingkungan bilah tiap 1 detik (sebelumnya 0,7 detik) dan aplikasi aktif hanya dibaca bila dipakai
- Pengaturan lama Otomatis dan Hitam dipindahkan ke Ikuti tema sistem secara otomatis

### Dihapus
- Warna bilah Otomatis dan Hitam
- Pembacaan piksel layar (`GetPixel`) yang membuat Pulau berat

## [0.4.0] 2026-10-18

### Ditambahkan
- Bilah menu ala macOS di mode *notch*: logo dengan menu cepat, nama aplikasi aktif, judul jendela, Wi-Fi, volume, baterai, tanggal dan jam
- Tema warna bilah: Otomatis, Wallpaper, Ikuti tema sistem, Hitam, Transparan
- Paduan warna: Murni atau Dipadukan dengan tema gelap atau terang Windows
- Mode Otomatis memakai warna wallpaper saat desktop terlihat dan menyatu dengan bagian atas aplikasi aktif saat ada jendela
- Pulau tertutup tampil sebagai *notch* polos dengan titik kamera saat bilah menu aktif
- Setiap item bilah dapat dinyalakan atau dimatikan

### Diperbaiki
- Teks lagu di pulau kecil bisa hilang karena lebar diukur saat animasi masih berjalan

## [0.3.0] 2026-10-18

### Ditambahkan
- Mode *notch*: Pulau didaftarkan sebagai *AppBar* Windows sehingga area atas layar dicadangkan dan jendela yang dimaksimalkan tidak lagi tertutup
- Bilah atas hitam penuh seperti MacBook (dapat dimatikan), tinggi bilah dapat diatur
- Pulau otomatis disembunyikan saat aplikasi layar penuh (video, game, presentasi)
- Log aktivitas dengan tiga level (Mati, Hanya galat, Semua aktivitas), rotasi otomatis 2 MB
- Penampil log di Pengaturan, bagian Data, dengan filter galat dan tombol kosongkan
- Pencatatan galat antarmuka, proses utama, dan PowerShell di satu file `pulau.log`

### Diubah
- Log PowerShell dikirim lewat stdout ke proses utama, tidak lagi menulis file sendiri
- `media.log` digantikan `pulau.log`
- Jendela pulau kini selebar layar agar bilah notch bisa digambar

## [0.2.1] 2026-10-18

### Diperbaiki
- Sampul album tidak tampil: pembacaan gambar kini mencoba empat cara berbeda dan mencatat penyebab kegagalan di log
- Percobaan ulang sampul diperpanjang menjadi 10 kali karena Spotify dan *browser* kadang mengirim gambar terlambat
- Jenis gambar dikenali dari isi berkas, bukan dari tipe yang dilaporkan Windows

### Ditambahkan
- Sampul cadangan dari iTunes Search bila Windows tidak menyediakan gambar (dapat dimatikan di Pengaturan, Musik)

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
