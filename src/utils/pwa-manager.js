let deferredPrompt;

export function captureInstallPrompt(event) {
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('pwa-prompt-available'));
}

export function getInstallPrompt() {
    return deferredPrompt;
}

export function resetInstallPrompt() {
    deferredPrompt = null;
}