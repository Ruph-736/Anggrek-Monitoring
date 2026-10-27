// Konfigurasi ini BOLEH berada di frontend. Firebase API key bukan secret;
// akses data harus dilindungi Firebase Authentication + Database Rules.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBjAtR3UAOO2QVMD5VuO3hbZV-YiamPCsA',
  authDomain: 'anggrek-monitoring.firebaseapp.com',
  databaseURL: 'https://anggrek-monitoring-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'anggrek-monitoring',
  appId: '1:886474031690:web:6071ccfa7133d3a4289cb3'
};
export const DEVICE_ID = 'anggrek_01';

// EMQX Serverless: ubah menjadi wss://HOST:8084/mqtt
// Boleh kosong; dashboard akan memakai Firebase/latest sebagai live fallback.
export const MQTT_WSS_URL = '';
export const MQTT_TOPIC = 'anggrek/anggrek_01/live';

// DIUBAH: Email admin terisi otomatis; pengguna dashboard hanya mengetik password.
// Email ini adalah akun Firebase Authentication (bukan akun Google Project Owner saja).
// Karena file frontend bersifat publik, gunakan password yang kuat dan aktifkan pembatasan Rules.
export const ADMIN_EMAIL = 'anggrekmonitoring12@gmail.com';
