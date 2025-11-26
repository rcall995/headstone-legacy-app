// /js/utils/qr-generator.js - QR Code generation for memorial pages
// Uses QRCode.js library (loaded from CDN in HTML)

const BASE_URL = 'https://www.headstonelegacy.com';

/**
 * Generate a QR code as SVG string
 * @param {string} memorialId - The memorial UUID
 * @param {object} options - Optional settings
 * @returns {Promise<string>} SVG string
 */
export async function generateQRCodeSVG(memorialId, options = {}) {
    const url = `${BASE_URL}/memorial?id=${memorialId}`;
    const size = options.size || 256;

    // Create a temporary container
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);

    return new Promise((resolve, reject) => {
        try {
            // Check if QRCode library is available
            if (typeof QRCode === 'undefined') {
                reject(new Error('QRCode library not loaded'));
                return;
            }

            new QRCode(container, {
                text: url,
                width: size,
                height: size,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H // High error correction for laser etching
            });

            // QRCode.js creates a canvas, convert to SVG
            setTimeout(() => {
                const canvas = container.querySelector('canvas');
                if (canvas) {
                    // Convert canvas to data URL for PNG, but we need SVG
                    // Let's create an SVG from the QR data
                    const svgString = canvasToSVG(canvas, size);
                    document.body.removeChild(container);
                    resolve(svgString);
                } else {
                    document.body.removeChild(container);
                    reject(new Error('Failed to generate QR code'));
                }
            }, 100);
        } catch (err) {
            document.body.removeChild(container);
            reject(err);
        }
    });
}

/**
 * Generate a QR code as PNG data URL
 * @param {string} memorialId - The memorial UUID
 * @param {object} options - Optional settings
 * @returns {Promise<string>} PNG data URL
 */
export async function generateQRCodePNG(memorialId, options = {}) {
    const url = `${BASE_URL}/memorial?id=${memorialId}`;
    const size = options.size || 1024; // High res for print

    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);

    return new Promise((resolve, reject) => {
        try {
            if (typeof QRCode === 'undefined') {
                reject(new Error('QRCode library not loaded'));
                return;
            }

            new QRCode(container, {
                text: url,
                width: size,
                height: size,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });

            setTimeout(() => {
                const canvas = container.querySelector('canvas');
                if (canvas) {
                    const dataUrl = canvas.toDataURL('image/png');
                    document.body.removeChild(container);
                    resolve(dataUrl);
                } else {
                    document.body.removeChild(container);
                    reject(new Error('Failed to generate QR code'));
                }
            }, 100);
        } catch (err) {
            document.body.removeChild(container);
            reject(err);
        }
    });
}

/**
 * Convert canvas to SVG (creates vector version for laser machines)
 * @param {HTMLCanvasElement} canvas
 * @param {number} size
 * @returns {string} SVG string
 */
function canvasToSVG(canvas, size) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Determine module size (QR code cell size)
    const moduleCount = Math.sqrt(countBlackModules(data, canvas.width));
    const moduleSize = size / moduleCount;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="100%" height="100%" fill="white"/>
  <g fill="black">`;

    // Sample the canvas to find black modules
    const step = canvas.width / moduleCount;
    for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
            const x = Math.floor(col * step + step / 2);
            const y = Math.floor(row * step + step / 2);
            const idx = (y * canvas.width + x) * 4;

            // Check if pixel is black (dark)
            if (data[idx] < 128) {
                svg += `\n    <rect x="${col * moduleSize}" y="${row * moduleSize}" width="${moduleSize}" height="${moduleSize}"/>`;
            }
        }
    }

    svg += `\n  </g>\n</svg>`;
    return svg;
}

/**
 * Count black modules to determine QR size
 */
function countBlackModules(data, width) {
    let transitions = 0;
    let wasBlack = data[0] < 128;

    // Count transitions in first row to estimate module count
    for (let x = 1; x < width; x++) {
        const idx = x * 4;
        const isBlack = data[idx] < 128;
        if (isBlack !== wasBlack) {
            transitions++;
            wasBlack = isBlack;
        }
    }

    // QR code has patterns, estimate module count
    // This is approximate - QR codes are typically 21, 25, 29, etc modules
    const estimatedModules = Math.round(transitions / 2);
    const standardSizes = [21, 25, 29, 33, 37, 41, 45, 49, 53, 57];
    return standardSizes.reduce((prev, curr) =>
        Math.abs(curr - estimatedModules) < Math.abs(prev - estimatedModules) ? curr : prev
    );
}

/**
 * Download QR code file
 * @param {string} content - File content (SVG string or data URL)
 * @param {string} filename - Name for the downloaded file
 * @param {string} type - 'svg' or 'png'
 */
export function downloadQRCode(content, filename, type = 'svg') {
    const link = document.createElement('a');

    if (type === 'svg') {
        const blob = new Blob([content], { type: 'image/svg+xml' });
        link.href = URL.createObjectURL(blob);
        link.download = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    } else {
        // PNG - content is already a data URL
        link.href = content;
        link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    }

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (type === 'svg') {
        URL.revokeObjectURL(link.href);
    }
}

/**
 * Generate and download all formats for a memorial
 * @param {string} memorialId - Memorial UUID
 * @param {string} memorialName - Memorial name for filename
 */
export async function downloadAllFormats(memorialId, memorialName) {
    const safeName = memorialName.replace(/[^a-z0-9]/gi, '-').toLowerCase();

    try {
        // Generate SVG
        const svg = await generateQRCodeSVG(memorialId, { size: 512 });
        downloadQRCode(svg, `${safeName}-qr-code.svg`, 'svg');

        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));

        // Generate high-res PNG
        const png = await generateQRCodePNG(memorialId, { size: 2048 });
        downloadQRCode(png, `${safeName}-qr-code.png`, 'png');

        return true;
    } catch (err) {
        console.error('Failed to generate QR codes:', err);
        throw err;
    }
}

/**
 * Get the memorial URL for a given ID
 * @param {string} memorialId
 * @returns {string}
 */
export function getMemorialURL(memorialId) {
    return `${BASE_URL}/memorial?id=${memorialId}`;
}
