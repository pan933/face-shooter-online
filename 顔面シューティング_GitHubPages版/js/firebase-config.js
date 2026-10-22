/*
 * Firebase Web app configuration.
 * Firebase Web app config for project face-61ed1.
 * These web config values are designed to be included in public client code.
 * NEVER put service-account JSON, private keys, or Admin SDK credentials here.
 */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHJ3y-FPSztLkj3VXIPWyKK7sFSW4rqgc",
  authDomain: "face-61ed1.firebaseapp.com",
  projectId: "face-61ed1",
  appId: "1:152576028995:web:f268b370966ff4a714fff6",
  storageBucket: "face-61ed1.firebasestorage.app",
  messagingSenderId: "152576028995",
  measurementId: "G-RJL7LQ25C0"
};

const requiredValues = [firebaseConfig.apiKey, firebaseConfig.authDomain, firebaseConfig.projectId, firebaseConfig.appId];
export const firebaseReady = requiredValues.every(value =>
  typeof value === "string" && value.length > 0 && !value.includes("PASTE_")
);
export let firebaseConfigError = null;
export let app = null;
export let auth = null;
export let db = null;

if (firebaseReady) {
  try {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    firebaseConfigError = error;
  }
}
