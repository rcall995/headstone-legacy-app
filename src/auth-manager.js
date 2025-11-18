// /js/auth-manager.js

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from '/js/firebase-config.js';
import { showToast } from '/js/utils/toasts.js';

export async function signIn(email, password) {
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithEmailAndPassword(auth, email, password);
        return true;
    } catch (error) {
        console.error("Sign-in error:", error);
        showToast("Failed to sign in. Please check your credentials.", 'error');
        return false;
    }
}

export async function signUp(name, email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await updateProfile(user, { displayName: name });
        await setDoc(doc(db, "users", user.uid), {
            name,
            email,
            createdAt: serverTimestamp(),
            isScout: false,
            isAdmin: false
        });
        return true;
    } catch (error) {
        console.error("Sign-up error:", error);
        showToast(`Could not create account: ${error.message}`, 'error');
        return false;
    }
}
