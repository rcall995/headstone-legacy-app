// --- Firebase Service Imports ---
import { initializeApp, setLogLevel } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

// --- Local Configuration Import ---
// CORRECTED PATH: Absolute path from the site root
import { config } from '/js/config.js'; 

// --- Configuration Object ---
const firebaseConfig = {
    apiKey: config.FIREBASE_API_KEY,
    authDomain: config.FIREBASE_AUTH_DOMAIN,
    projectId: config.FIREBASE_PROJECT_ID,
    storageBucket: config.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: config.FIREBASE_MESSAGING_SENDER_ID,
    appId: config.FIREBASE_APP_ID
};

// --- Configuration Check ---
if (!config || !firebaseConfig.apiKey) {
    console.error("Firebase configuration is missing or incomplete. Make sure your `config.js` file is present and has all the required Firebase keys.");
    throw new Error("Firebase configuration error.");
}

// --- Initialization ---
setLogLevel('warn');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// --- Exports ---
export { app, auth, db, storage, functions };