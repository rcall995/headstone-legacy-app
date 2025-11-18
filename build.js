/* build.js */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

// Load .env only if running locally (Vercel injects env vars directly)
if (fs.existsSync('.env')) {
  dotenvConfig();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const publicDir = path.resolve(__dirname, 'public');
const srcDir    = path.resolve(__dirname, 'src');
const distDir   = path.resolve(__dirname, 'dist');

/* ---------- utils ---------- */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/* ---------- config.js writer ---------- */
function writeConfigJs(destJsDir) {
  ensureDir(destJsDir);
  const outPath = path.join(destJsDir, 'config.js');
  const content = `
export const config = {
  FIREBASE_API_KEY: "${process.env.FIREBASE_API_KEY || ''}",
  FIREBASE_AUTH_DOMAIN: "${process.env.FIREBASE_AUTH_DOMAIN || ''}",
  FIREBASE_PROJECT_ID: "${process.env.FIREBASE_PROJECT_ID || ''}",
  FIREBASE_STORAGE_BUCKET: "${process.env.FIREBASE_STORAGE_BUCKET || ''}",
  FIREBASE_MESSAGING_SENDER_ID: "${process.env.FIREBASE_MESSAGING_SENDER_ID || ''}",
  FIREBASE_APP_ID: "${process.env.FIREBASE_APP_ID || ''}",
  SQUARE_APP_ID: "${process.env.SQUARE_APP_ID || ''}",
  MAPBOX_ACCESS_TOKEN: "${process.env.MAPBOX_ACCESS_TOKEN || ''}"
};
  `.trim() + '\n';
  fs.writeFileSync(outPath, content, 'utf8');
  console.log('  ✓ wrote', path.relative(__dirname, outPath));
}

/* ---------- build ---------- */
function build() {
  console.log('— Build start —');
  console.log('  publicDir:', publicDir, fs.existsSync(publicDir) ? '(found)' : '(missing)');
  console.log('  srcDir   :', srcDir,    fs.existsSync(srcDir)    ? '(found)' : '(missing)');
  console.log('  distDir  :', distDir);

  // Debug: Check if env vars are loaded
  const hasFirebaseConfig = !!(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID);
  console.log('  Firebase env vars:', hasFirebaseConfig ? 'found' : 'MISSING');

  // 1) clean dist
  emptyDir(distDir);
  console.log('  ✓ cleaned dist/');

  // 2) copy public → dist
  if (fs.existsSync(publicDir)) {
    copyRecursive(publicDir, distDir);
    console.log('  ✓ copied public/ → dist/');
  } else {
    console.warn('  ⚠ public/ not found — nothing copied for static assets.');
  }

  // 3) copy src → dist/js
  if (fs.existsSync(srcDir)) {
    const jsDest = path.join(distDir, 'js');
    copyRecursive(srcDir, jsDest);
    console.log('  ✓ copied src/ → dist/js/');
  } else {
    console.warn('  ⚠ src/ not found — no JS sources copied.');
  }

  // 4) emit config.js into dist/js
  writeConfigJs(path.join(distDir, 'js'));

  // (Optional) mirror compiled JS back to public/js
  // If you are still deploying "public" as hosting root, uncomment this line
  // to keep public/js in sync with src:
  // if (fs.existsSync(srcDir)) { copyRecursive(srcDir, path.join(publicDir, 'js')); console.log('  ✓ mirrored src/ → public/js/'); }

  console.log('— Build complete —');
}

build();
