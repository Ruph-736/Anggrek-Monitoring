# AnggrekSense Sederhana (versi persiapan)

Desain dashboard lama **dipertahankan**. Firebase Auth, UID dan custom token dihilangkan. Hanya login password website melalui cookie HTTP-only Vercel. Database Firebase tertutup dan diakses oleh Admin SDK backend. EMQX tetap menjadi jalur Live setiap 5 detik; ESP32 mengirim log setiap 60 detik lewat HTTPS Vercel. **Tidak ada penghapusan otomatis log 90 hari.**

## File dan fungsi
- `index.html`, `styles.css`, `logo-...`, `icon-...`: desain lama (penyesuaian kecil pada tombol periode & backup saja).
- `app.js`: UI tetap; login cookie website dan pembacaan `/api/data`; Live lewat `/api/live`.
- `api/login.js`, `api/session.js`, `lib/session.js`: satu password Vercel tanpa Firebase Authentication.
- `api/live.js`: stream MQTT TLS EMQX ke browser memakai cookie sesi website.
- `api/data.js`: baca Firebase realtime DB lewat backend setelah pemeriksaan sesi (backup bulanan dipaginasi 6 bagian).
- `api/ingest.js`: ingest HTTPS log ESP32 memakai `DEVICE_INGEST_TOKEN`.
- `lib/firebase.js`: koneksi privat Firebase Admin.
- `firmware/AnggrekSense.ino`, `firmware/config.example.h`: ESP32/SHT30/MQTT/HTTPS; sertifikat CA root TLS wajib diisi.
- `firebase.rules.json`: database tertutup, indeks query logs/hourly.

## Environments di Vercel (Production)
- `DASHBOARD_PASSWORD` password website
- `SESSION_SECRET` random minimal 32 karakter (gunakan 64 hex karakter acak)
- `EMQX_HOST` host broker baru tanpa protokol/port
- `EMQX_USERNAME` username broker untuk satu alat dan backend (untuk instalasi kecil), atau buat akun subscribe terpisah jika diperlukan
- `EMQX_PASSWORD` password broker baru
- `FIREBASE_DATABASE_URL` URL database baru yang telah diizinkan Google
- `FIREBASE_SERVICE_ACCOUNT_JSON` JSON service account dari proyek yang diizinkan Google; simpan di Vercel saja
- `DEVICE_INGEST_TOKEN` nilai acak panjang minimal 32 karakter, sama pada firmware config.h

`FIREBASE_OWNER_UID`, `EMQX_VIEWER_USERNAME` dan `EMQX_VIEWER_PASSWORD` lama tidak digunakan dalam kode baru; HAPUS setelah backend baru berhasil terdeploy.

## Data
`devices/anggrek_01/latest`, `logs/YYYYMM/timestamp`, `hourly/YYYYMM/hourStart`.
Log disimpan setiap menit. Agregat per jam menggunakan transaction untuk menjaga `count`, `t_sum` dan `h_sum`. Backup CSV bulanan tetap ada. Mode live adalah 15 menit sementara di RAM browser; setelah refresh mulai mengumpulkan data baru.

## Sebelum deploy
1. Selesaikan penangguhan Google Cloud lama sesuai ketentuan Google; jangan memakai proyek baru untuk menghindari penegakan yang berlaku.
2. Isi variabel env baru di Vercel dan konfigurasi `config.h` firmware baru. JANGAN taruh nilai rahasia di GitHub.
3. Pastikan Firebase rules baru diaktifkan, EMQX broker baru sudah aktif, dan sertifikat CA sesuai endpoint.
4. Commit isi kode, redeploy Vercel, uji /api/session (sebelum login), login website, MQTT Live, log menit, riwayat, backup.
5. Jangan jalankan sketch baru sebelum URL HTTPS, CA, dan token sudah benar.

## Keterbatasan
- Kode masih template sampai kredensial broker/Firebase baru tersedia. Tidak bisa dinyatakan telah terhubung dari sini.
- WebSocket memerlukan Vercel Functions yang mendukung WebSocket. Cek paket Vercel, durasi dan kuota.
- Password login website tidak mempunyai rate limit terdistribusi pada contoh ini. Aktifkan Vercel Deployment Protection/WAF/rate limiting sebelum dibuka luas.
- Firebase Spark memiliki batas penyimpanan dan unduhan. Pantau setiap bulan, terutama jika data berjalan 24 jam.

## Cara cepat upload (GitHub + Vercel)
1. Ekstrak ZIP. Upload **seluruh isi** ZIP ke root repo `Anggrek-Monitoring`, bukan folder pembungkus. Timpa `index.html`, `styles.css`, `app.js`, `config.js`, `package.json`, kedua PNG serta folder `api/` dan `lib/`.
2. Di Vercel → Project → Settings → Environment Variables, isi variabel yang tertera di bagian atas panduan. Pilih Production. Klik Redeploy sesudah perubahan. Jangan memasukkan password ke GitHub.
3. Firmware: `firmware/config.example.h` disalin ke `firmware/config.h` secara lokal, kemudian isi host, username, password, domain Vercel, token perangkat, serta sertifikat CA. Buka `AnggrekSense.ino` dengan Arduino IDE; install WiFiManager, PubSubClient, ArduinoJson v7, serta board ESP32.
4. Firebase Realtime Database: terapkan `firebase.rules.json` di menu Rules, set kredensial service account hanya pada Vercel. Tidak perlu Firebase Authentication untuk pengunjung. Firebase project yang digunakan harus berada dalam keadaan aktif dan penggunaannya diizinkan Google.
5. EMQX: broker aktif MQTT over TLS port `8883`, satu akun MQTT berizin Publish dan Subscribe topic `anggrek/anggrek_01/live`, dengan password baru.
6. Cek login web, MQTT LIVE, HTTP 200 `/api/ingest` pada Serial Monitor, dan munculnya data `devices/anggrek_01/logs` di Firebase.

**Catatan:** paket ini bersifat template integrasi. Akun dan sertifikat layanan baru **belum** terpasang karena rahasia tidak dibagikan. Jangan langsung menyalakan monitoring produksi sebelum pengujian koneksi dan data nyata. Tidak perlu dan tidak boleh memasukkan password EMQX ke `config.js`. Untuk aplikasi publik, aktifkan pembatasan percobaan login pada Vercel WAF.
