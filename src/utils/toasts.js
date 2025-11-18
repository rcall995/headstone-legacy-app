/**
 * src/utils/toasts.js
 * Displays a Bootstrap 5 toast notification.
 */

/**
 * Escapes HTML to prevent XSS attacks
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error('Toast container element with class ".toast-container" was not found in your HTML!');
        return;
    }

    // Check if bootstrap is loaded
    if (typeof bootstrap === 'undefined') {
        console.error('Bootstrap library is not loaded');
        return;
    }

    const settings = {
        success: { icon: 'fa-check-circle', header: 'Success', bg: 'text-bg-success' },
        error: { icon: 'fa-exclamation-triangle', header: 'Error', bg: 'text-bg-danger' },
        info: { icon: 'fa-info-circle', header: 'Notice', bg: 'text-bg-primary' }
    };

    const config = settings[type] || settings['info'];
    const toastId = `toast-${Date.now()}`;

    // Escape message to prevent XSS
    const safeMessage = escapeHtml(message);

    const toastHTML = `
        <div id="${toastId}" class="toast ${config.bg}" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <i class="fas ${config.icon} rounded me-2"></i>
                <strong class="me-auto">${config.header}</strong>
                <small>Just now</small>
                <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
            <div class="toast-body">
                ${safeMessage}
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    const toastEl = document.getElementById(toastId);
    if (!toastEl) {
        console.error(`Failed to find toast element with ID: ${toastId}`);
        return;
    }

    const toast = new bootstrap.Toast(toastEl, {
        autohide: true,
        delay: 5000
    });

    toastEl.addEventListener('hidden.bs.toast', () => {
        toastEl.remove();
    });

    toast.show();
}