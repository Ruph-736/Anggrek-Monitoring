# AnggrekSense — Dashboard ESP32 + SHT30

Dashboard web statis untuk Vercel, memakai Firebase Realtime Database untuk riwayat dan EMQX untuk MQTT real-time (opsional pada web). Gaya visual sama dengan dashboard Pressure Kit.

## Konfigurasi cepat

1. Buka `config.js`. Isi `FIREBASE_CONFIG.apiKey` dan `FIREBASE_CONFIG.appId` berdasarkan Project settings → Your apps → Web app di Firebase Console. Cocokkan `authDomain`, `databaseURL`, dan `projectId` dengan milikmu.
2. `ADMIN_EMAIL` sudah diisi dari akun Admin Authentication yang pernah kamu tunjukkan. Koreksi jika akun admin berbeda. Web hanya menampilkan field **password**. Password **jangan pernah** dimasukkan ke file web.
3. Bila ingin monitoring MQTT live tiap 5 detik dari browser, isi `MQTT_WSS_URL` (umumnya `wss://HOST_EMQX:8084/mqtt`). Login menggunakan akun subscribe-only di menu Informasi Perangkat. Jika tidak, sensor terbaru diambil dari Firebase dan diperbarui tiap 60 detik.
4. Pastikan Firebase Authentication → Sign-in method → Email/Password aktif. Tambahkan domain Vercel kamu di Firebase Authentication → Settings → Authorized domains. Pastikan akun Admin sudah ada di Authentication → Users (akun Google Owner proyek **tidak otomatis** akun Authentication).
5. Pastikan Firebase Realtime Database Rules memberikan akun Admin izin membaca `/devices/anggrek_01/latest`, `logs` dan `hourly`, serta izin menghapus log lama sesuai kebutuhan.
6. Upload file `index.html`, `styles.css`, `app.js`, `config.js`, `logo-anggreksense.png`, `icon-anggreksense.png` langsung ke direktori utama repo `Ruph-736/Anggrek-Monitoring`. File `README.md` opsional. Vercel otomatis deploy ulang ketika GitHub diperbarui.

## Pemakaian dan keamanan

- Password-only adalah **tampilan login saja**. Firebase tetap mengautentikasi menggunakan email Admin yang tersimpan di `config.js` + password yang diketik pengguna.
- Konfigurasi frontend dan email admin bisa dibaca oleh publik; API key Firebase bukan kunci admin rahasia. **Jangan** taruh password Firebase, EMQX, atau service-account credentials di file web.
- Aturan Firebase Database (berbasis UID) adalah perlindungan akses utama. Karena repository kamu publik, jangan mengunggah firmware `config.h` yang berisi kredensial perangkat.
- Interval data: SHT30 2 detik, MQTT 5 detik, Firebase 60 detik. Log dan grafik 1/6/24 jam memakai data per menit; grafik 1 bulan memakai agregat per jam.
- Arsip bulan via CSV; penghapusan log bulan tua tetap harus dikonfirmasi dan hanya setelah backup pada sesi aktif; unduhan CSV tidak diverifikasi otomatis oleh browser. Periksa isi backup sebelum menghapus apa pun.
- Tidak ada data demo/palsu. Data realtime hanya terlihat jika ESP32 telah mengirim.
