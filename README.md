# AnggrekSense - Login website + MQTT otomatis (server Vercel)

## Apa yang berubah
- `index.html`: login password saja, tanpa input MQTT / CDN mqtt.js, tombol Sambungkan Ulang untuk mencoba ulang koneksi otomatis.
- `app.js`: setelah Firebase login, langsung terhubung ke `wss://<DOMAIN_WEBSITE>/api/live`; Firebase ID Token dikirim melalui WebSocket HTTPS/WSS untuk autentikasi server. Tidak ada username/password MQTT di frontend.
- `api/live.js`: BARU, fungsi WebSocket di Vercel. Verifikasi Firebase ID token untuk `FIREBASE_OWNER_UID`, lalu MQTT TLS port 8883 ke EMQX dengan akun viewer dari Vercel env; stream JSON sensor ke browser.
- `config.js`: hanya konfigurasi publik Firebase (tidak ada secret MQTT).
- `package.json`: menambah `mqtt` dan `ws` (server side) selain `firebase-admin`.
- `styles.css`: logo/icon transparan serta login sederhana.
- `logo-anggreksense.png`, `icon-anggreksense.png`: PNG berwarna dengan background transparan.
- `api/login.js`: tetap digunakan, tidak diubah.

## Setup wajib di EMQX Cloud
1. Di *Access Control > Authentication*, buat USER MQTT BARU khusus viewer, misalnya `anggrek_viewer`. Pakai password acak, JANGAN akun ESP32 dan JANGAN akun administrator.
2. Di *Access Control > Authorization* tambah rule USERNAME viewer:
   - Subscribe -> Allow -> `anggrek/anggrek_01/live`
   - Publish -> Deny -> `#`
   - Untuk isolasi ketat: tambahkan Subscribe -> Deny -> `#` (pastikan urutannya tidak mendahului Allow Subscribe yang lebih spesifik, atau gunakan global Deny-all setelah semua per-user Allow).
3. Jangan aktifkan Global Deny-all begitu saja jika izin publish ESP32 belum dibuat; itu akan menghentikan alat.
4. Uji di MQTTX: viewer dapat Subscribe topic live tetapi tidak bisa Publish topic lain.

## Setup Vercel > Project > Settings > Environment Variables
SEMUA variabel di bawah hanya untuk backend, jangan ditulis di `config.js`.

| Name | Value |
| --- | --- |
| `DASHBOARD_PASSWORD` | Password LOGIN website yang sudah dipakai |
| `FIREBASE_OWNER_UID` | UID Firebase Auth yang sama dengan `api/login.js` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON Firebase Admin asli (sudah dipakai `api/login.js`) |
| `EMQX_HOST` | Host broker (tanpa `mqtts://`, `wss://`, `:8883`, atau `/mqtt`) |
| `EMQX_VIEWER_USERNAME` | Username viewer baru dari EMQX |
| `EMQX_VIEWER_PASSWORD` | Password viewer baru dari EMQX |

Pilih environment **Production**, simpan env, lalu **redeploy** terbaru dari GitHub.

## Cara pakai
1. Commit isi folder ini (isi folder, bukan membungkusnya menjadi folder baru) ke root repo GitHub.
2. Vercel -> Deployments -> pastikan status **Ready**.
3. Website -> login dengan password tunggal -> dashboard otomatis menerima MQTT ketika ada ESP32 yang mengirim data.
4. Jika ada gangguan, buka Informasi Perangkat: `mqtt-info` menunjukkan status. Tombol Sambungkan Ulang meminta WebSocket Vercel terhubung kembali tanpa minta password MQTT.
5. Jika ada galat, buka Vercel -> Logs dan EMQX -> Logs/Clients untuk melihat error auth/ACL. Tidak ada koneksi MQTT aktual yang bisa dijamin tanpa deployment yang sudah berjalan dan pengaturan env.

## Catatan keamanan
- Tidak ada MQTT secret di file frontend ataupun respons WebSocket. Hanya data suhu/kelembapan yang diteruskan ke klien yang berhasil login.
- Browser mengirim Firebase ID token (kredensial sesi Firebase) ke endpoint `wss://` domain website sendiri. Gunakan HTTPS di Production. Jangan tambahkan token ke URL / console logs.
- Kredensial ESP32 yang sebelumnya pernah ditaruh dalam source GitHub / chat harus dirotasi pada EMQX, lalu diperbarui di firmware; gunakan akun viewer baru yang read-only.
- Serverless WebSocket Vercel memiliki batas durasi fungsi. `app.js` akan melakukan reconnect otomatis bila WebSocket ditutup.
- Fungsi menghasilkan koneksi MQTT tersendiri per browser. Pantau batas connection minutes EMQX dan Vercel resource limits.
- **Kebutuhan**: Vercel Functions yang mendukung WebSocket (Vercel mengumumkan GA 20 Oct 2026). `api/live.js` memakai default-export `http.Server` sesuai contoh dokumentasi Vercel.
