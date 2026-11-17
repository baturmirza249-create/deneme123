// ════════════════════════════════════════════════════════
// FIREBASE AYARLARI & YÖNETİCİ E-POSTA TANIMI
// ════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyC3LcGZ6WkPQk9ubETH11e9qjPJ-QsnLgQ",
  authDomain: "denme123-f63fa.firebaseapp.com",
  projectId: "denme123-f63fa",
  storageBucket: "denme123-f63fa.firebasestorage.app",
  messagingSenderId: "91726108687",
  appId: "1:91726108687:web:b78e65cc1fb588aea16b7a",
  measurementId: "G-4F0S3QGW63"
};

// Yönetici panelini açacak olan yetkili Google E-posta adresi:
const ADMIN_EMAIL = "baturmirza249@gmail.com";

// Firebase Başlatma
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();