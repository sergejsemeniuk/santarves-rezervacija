import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Вставь сюда конфиг своего Firebase-проекта:
// Firebase Console → Project settings → General → вкладка "Your apps" → Web app (</>) → SDK setup and configuration.
// Это НЕ секретные ключи — они видны в браузере у любого пользователя приложения,
// реальная защита данных настраивается через Firestore Rules (см. firestore.rules).
const firebaseConfig = {
  apiKey: "AIzaSyADy0NlLFCJNmRsJuLdGsTEKBETmVaPpBQ",
  authDomain: "santarves-reservation.firebaseapp.com",
  projectId: "santarves-reservation",
  storageBucket: "santarves-reservation.firebasestorage.app",
  messagingSenderId: "60010399068",
  appId: "1:60010399068:web:c629bfb482470557f4ed99",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
