# Kontribusi

Terima kasih sudah mau membantu. Aturannya sederhana.

## Melaporkan *bug*

Buka *issue* dan sertakan:

1. Versi Windows dan versi Pulau (ada di Pengaturan, bagian bawah menu samping).
2. Langkah untuk memunculkan masalah.
3. *Screenshot* bila terkait tampilan.
4. Isi **Buka log media** dari ikon *tray* bila terkait musik, sampul, volume, atau Caps Lock.

## Mengusulkan fitur

Buka *issue* berisi masalah yang ingin dipecahkan, bukan hanya solusinya. Cek [docs/ROADMAP.md](docs/ROADMAP.md) lebih dulu agar tidak dobel.

## Menyiapkan lingkungan

```bash
git clone https://github.com/LippyyDev/WinDynamicIsland.git
cd WinDynamicIsland
npm install
npm start
```

Fitur musik dan notifikasi sistem hanya berjalan di Windows.

## Pedoman kode

* Tanpa kerangka kerja antarmuka. Satu modul per fitur di `renderer/js/`.
* Semua teks yang berasal dari pengguna atau pemutar harus lewat `esc()` sebelum masuk ke HTML.
* Data baru disimpan lewat `store.js`. Tambahkan nilai bawaan di `DEFAULTS`.
* Jangan menambahkan permintaan jaringan baru tanpa diskusi. Prinsip proyek ini: data tetap di PC pengguna.
* Teks antarmuka berbahasa Indonesia. Istilah asing dicetak miring pada dokumentasi.
* Jalankan `node --check` pada berkas JavaScript yang diubah.

## Alur *pull request*

1. *Fork* dan buat cabang dengan nama jelas, misalnya `fix/sampul-spotify`.
2. Satu masalah per PR. Jelaskan apa yang berubah dan bagaimana mengujinya.
3. Perbarui `CHANGELOG.md` pada bagian `Belum dirilis`.
4. Pastikan GitHub Actions berhasil membangun *installer*.

## Lisensi

Dengan berkontribusi, kamu setuju kontribusimu dilisensikan di bawah [MIT](LICENSE).
