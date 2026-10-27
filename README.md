# AnggrekSense – Website Login Cukup Password

Versi ini menghilangkan login email Firebase pada dashboard. **Tetap gunakan `config.js` yang saat ini ada di repository kamu** supaya URL/API key Firebase dan alamat EMQX tidak tertimpa. File `config.js` sengaja tidak diikutkan dalam ZIP revisi. Grafik, log, backup, dan MQTT tetap sama.

## Update GitHub

Upload dan replace file `index.html`, `app.js`, `styles.css`, `logo-anggreksense.png`, `icon-anggreksense.png`, `package.json`, `.gitignore`, `README.md`, dan **folder `api/` beserta `login.js`**. Pertahankan `config.js` lama di root repo. Pastikan path: `api/login.js` (bukan `login.js` di root).

## Setting Vercel (Project → Settings → Environment Variables)

Buat tiga Environment Variables berikut untuk Production (dan Preview jika perlu):

- `DASHBOARD_PASSWORD`: password **baru** untuk masuk website, minimal 12 karakter acak/unik. Jangan pakai password ESP32/Firebase yang pernah tertulis di chat.
- `FIREBASE_OWNER_UID`: **UID akun Owner/Admin pada Firebase Authentication → Users** yang sudah memiliki akses baca/hapus dalam Realtime Database Rules. Bukan email, bukan Google Cloud IAM ID.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: isi **JSON service account** lengkap dari Firebase Console → Project settings → Service accounts → Firebase Admin SDK → Generate new private key. Tempel isi JSON sebagai **nilai environment variable Vercel**, jangan upload JSON ke GitHub atau frontend.

**Setelah setting env:** Deployments → Redeploy untuk menerapkan env baru. Jika Vercel memakai framework preset `Other`, root `./`; build command default; Node.js serverless route `/api/login` tersedia.

## Firebase

- `config.js` tetap perlu `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId` Web App yang benar. `ADMIN_EMAIL` pada config.js boleh dibiarkan, sudah tidak digunakan.
- Firebase Authentication harus tetap aktif (custom token di belakang layar). Browser tidak perlu memasukkan email Admin.
- Jangan mengubah Database Rules jadi `.read=true`/`.write=true`. UID yang dipakai di `FIREBASE_OWNER_UID` **harus sama** dengan UID yang diberi akses baca dan backup pada Rules.
- MQTT WSS di browser tetap opsional, datanya tetap tampil dari `latest` Firebase jika MQTT browser belum connect.
- Serverless functions pada Vercel memerlukan ketersediaan fungsi sesuai plan. Jangan bagikan service account JSON, password, atau token.

## Catatan keamanan

Website dengan password saja yang aman tetap memerlukan backend. Endpoint `/api/login` membandingkan password di server (timing-safe hash), lalu menerbitkan Firebase custom token untuk UID yang diizinkan. Simpan semua secret hanya dalam Environment Variables Vercel. Untuk situs publik jangka panjang, gunakan password kuat dan rate limiting melalui fitur proteksi platform; fungsi tidak memasang pembatas percobaan lintas server. Jika password bocor, ganti lewat Vercel → Environment Variables lalu redeploy.
