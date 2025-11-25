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
                data: {
                    name: name,
                    display_name: name
                }
            }
        });

        if (error) throw error;

        // Create profile in profiles table
        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    email: email,
                    name: name,
                    is_scout: false,
                    is_admin: false
                });

            if (profileError) {
                console.error("Profile creation error:", profileError);
                // Don't fail signup if profile creation fails - it can be created later
            }
        }

        return true;
    } catch (error) {
        console.error("Sign-up error:", error);
        showToast(`Could not create account: ${error.message}`, 'error');
        return false;
    }
}

export async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Sign-out error:", error);
        showToast("Failed to sign out.", 'error');
        return false;
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
