// /js/auth-manager.js - Supabase Auth

import { supabase } from '/js/supabase-client.js';
import { showToast } from '/js/utils/toasts.js';

export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Sign-in error:", error);
        showToast("Failed to sign in. Please check your credentials.", 'error');
        return false;
    }
}

export async function signUp(name, email, password) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin + '/login',
                data: {
                    name: name,
                    display_name: name
                }
            }
        });

        if (error) throw error;

        // Profile is auto-created by database trigger (handle_new_user)
        // The trigger uses display_name from user metadata set above

        return true;
    } catch (error) {
        console.error("Sign-up error:", error);
        showToast(`Could not create account: ${error.message}`, 'error');
        return false;
    }
}

export async function signOut() {
    try {
        console.log('[Auth] Calling supabase.auth.signOut()');
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Sign out timed out')), 5000)
        );
        const signOutPromise = supabase.auth.signOut({ scope: 'local' });

        const { error } = await Promise.race([signOutPromise, timeoutPromise]);
        console.log('[Auth] signOut result:', error ? error : 'success');
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("[Auth] Sign-out error:", error);
        // Even on error, clear local storage and return true to allow redirect
        localStorage.removeItem('sb-wsgxvhcdpyrjxyuhlnnw-auth-token');
        return true;
    }
}

export async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/memorial-list?status=published'
            }
        });

        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Google sign-in error:", error);
        showToast("Failed to sign in with Google.", 'error');
        return false;
    }
}

export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}
