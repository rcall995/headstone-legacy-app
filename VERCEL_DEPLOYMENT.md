# Vercel Deployment Guide for headstonememorial.com

This guide will help you deploy the Headstone Legacy app to Vercel with your custom domain.

## Prerequisites

- A Vercel account (sign up at https://vercel.com)
- Access to your domain DNS settings for headstonememorial.com
- Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Push Your Code to Git

1. **Initialize Git repository** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit - ready for Vercel deployment"
   ```

2. **Create a GitHub repository** and push:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Import Project to Vercel

1. Go to https://vercel.com/new
2. Click "Import Git Repository"
3. Select your repository
4. Configure the project:
   - **Project Name**: `headstone-legacy` (or your preferred name)
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: `npm run build` (auto-detected from package.json)
   - **Output Directory**: `dist` (auto-detected from vercel.json)
   - **Install Command**: `npm install`

## Step 3: Configure Environment Variables

**CRITICAL**: You must add these environment variables in Vercel:

1. In your Vercel project dashboard, go to **Settings** → **Environment Variables**
2. Add the following variables (from your `.env` file):

| Variable Name | Value |
|--------------|-------|
| `FIREBASE_API_KEY` | `AIzaSyC-KAIefDHgOEmRkwkeLUFUvWXX1QYNOGc` |
| `FIREBASE_AUTH_DOMAIN` | `headstonememorial.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `headstonememorial` |
| `FIREBASE_STORAGE_BUCKET` | `headstonememorial.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | `45248353162` |
| `FIREBASE_APP_ID` | `1:45248353162:web:fa93be0ad02af1e14d6e73` |
| `MAPBOX_ACCESS_TOKEN` | `pk.eyJ1IjoicmNhbGwxNDA3MiIsImEiOiJjbWUzcmwybmkwOXFyMnRwejhiNG10OXZyIn0.pCk3N77xIXzxh_RmBbnWaA` |

**Important**: Set these for all environments (Production, Preview, Development)

## Step 4: Deploy

1. Click **Deploy**
2. Vercel will:
   - Install dependencies (`npm install`)
   - Run the build command (`npm run build`)
   - Deploy the `dist/` folder
3. Wait for deployment to complete (usually 1-2 minutes)

## Step 5: Add Custom Domain (headstonememorial.com)

1. In your Vercel project, go to **Settings** → **Domains**
2. Click **Add Domain**
3. Enter `headstonememorial.com`
4. Vercel will provide DNS records to add:

### Option A: Using Vercel Nameservers (Recommended)
Vercel will provide nameservers like:
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```
Update your domain registrar to use these nameservers.

### Option B: Using A/CNAME Records
Add these DNS records to your domain:

**For root domain (headstonememorial.com):**
- Type: `A`
- Name: `@`
- Value: `76.76.21.21` (Vercel's IP)

**For www subdomain:**
- Type: `CNAME`
- Name: `www`
- Value: `cname.vercel-dns.com`

5. Wait for DNS propagation (can take up to 48 hours, usually 1-2 hours)
6. Vercel will automatically provision SSL certificate

## Step 6: Configure Firebase for Your Domain

You need to add your Vercel domain to Firebase authorized domains:

1. Go to https://console.firebase.google.com
2. Select your project: `headstonememorial`
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add these domains:
   - `headstonememorial.com`
   - `www.headstonememorial.com`
   - `your-project.vercel.app` (your Vercel preview domain)

## Step 7: Test Your Deployment

1. Visit `https://headstonememorial.com`
2. Test critical features:
   - [ ] Sign up / Sign in
   - [ ] Create memorial
   - [ ] Upload photos
   - [ ] Scout mode
   - [ ] Mobile menu
   - [ ] Map rendering

## Automatic Deployments

Vercel automatically deploys when you push to your Git repository:

- **Push to `main` branch** → Production deployment (headstonememorial.com)
- **Push to other branches** → Preview deployment (unique URL)
- **Pull requests** → Preview deployment with comment on PR

## Build Logs & Monitoring

- **Build logs**: Project → Deployments → Click deployment → View build logs
- **Runtime logs**: Project → Deployments → Click deployment → Functions tab
- **Analytics**: Project → Analytics (if enabled)

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Verify all environment variables are set
- Ensure `build.js` has access to environment variables

### Firebase Authentication Doesn't Work
- Verify domain is added to Firebase authorized domains
- Check browser console for errors
- Verify environment variables are correct

### Photos Don't Upload
- Check Firebase Storage rules
- Verify `FIREBASE_STORAGE_BUCKET` environment variable
- Check browser console for CORS errors

### Map Doesn't Load
- Verify `MAPBOX_ACCESS_TOKEN` is set correctly
- Check browser console for Mapbox errors

## Rollback a Deployment

1. Go to **Deployments**
2. Find the previous working deployment
3. Click **⋯** → **Promote to Production**

## Custom Build Configuration

The project uses:
- **vercel.json**: Routing, headers, and caching rules
- **build.js**: Custom build script that injects environment variables
- **.vercelignore**: Files to exclude from deployment

## Security Notes

- Never commit `.env` file to Git
- All environment variables are injected at build time
- API keys are exposed client-side (normal for Firebase web apps)
- Consider setting up Firebase App Check for production

## Performance Optimization

Vercel automatically provides:
- Global CDN
- Automatic HTTPS
- Brotli compression
- Image optimization (if using Vercel Image Optimization)
- Edge caching for static assets

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Support: https://vercel.com/support
- Firebase Docs: https://firebase.google.com/docs

---

## Quick Reference Commands

```bash
# Local development
npm run dev

# Build locally
npm run build

# Test build output locally
npx serve dist

# Deploy to Vercel via CLI (optional)
npm install -g vercel
vercel --prod
```

## Project Structure for Vercel

```
headstone-project/
├── src/               # Source files (not deployed)
├── public/            # Static assets (not deployed)
├── dist/              # Build output (deployed to Vercel)
├── build.js           # Custom build script
├── vercel.json        # Vercel configuration
├── .vercelignore      # Files to exclude
└── package.json       # Dependencies & scripts
```

**Note**: Only the `dist/` folder is deployed to Vercel. The build process copies and processes files from `src/` and `public/` into `dist/`.
