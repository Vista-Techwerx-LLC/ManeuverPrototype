# Deploying to GitHub Pages

## Quick Setup (5 minutes)

### Step 1: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **GitHub Actions**
4. Click **Save**

### Step 2: Add Repository Secrets

You need to add your environment variables as GitHub Secrets:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** for each of these:

   **Secret 1:**
   - Name: `VITE_SUPABASE_URL`
   - Value: `https://gtxpddflqovdsutboirn.supabase.co`

   **Secret 2:**
   - Name: `VITE_SUPABASE_ANON_KEY`
   - Value: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0eHBkZGZscW92ZHN1dGJvaXJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5OTM5NDksImV4cCI6MjA4MTU2OTk0OX0.eqhqTCTtVhMF3o0FIdUDgQco8fg07uB7G3BBPYkJLBk`

   **Secret 3:**
   - Name: `VITE_CLOUD_WS_URL`
   - Value: `wss://host-bridge-production.up.railway.app`

### Step 3: Push to GitHub

1. Commit and push the workflow file:
   ```bash
   git add ReactRoot/.github/workflows/deploy.yml
   git add ReactRoot/vite.config.js
   git commit -m "Add GitHub Pages deployment"
   git push
   ```

2. GitHub Actions will automatically:
   - Build your React app
   - Deploy it to GitHub Pages
   - Your site will be live at: `https://yourusername.github.io/ManeuverPrototype/`

### Step 4: Check Deployment

1. Go to **Actions** tab in your GitHub repo
2. You should see a workflow running called "Deploy to GitHub Pages"
3. Wait for it to complete (green checkmark)
4. Go to **Settings** → **Pages** to see your site URL

## Important Notes

### Repository Name
- If your repo is named something other than `ManeuverPrototype`, update the `base` path in `vite.config.js`
- For example, if your repo is `msfs-tracker`, change:
  ```js
  base: process.env.GITHUB_PAGES === 'true' ? '/msfs-tracker/' : '/',
  ```

### Custom Domain (Optional)
If you want a custom domain:
1. Add a `CNAME` file in `ReactRoot/public/` with your domain
2. Update your DNS settings
3. GitHub Pages will automatically use it

### Manual Deployment
If you prefer to deploy manually:
```bash
cd ReactRoot
npm run build
# Then upload the 'dist' folder contents to GitHub Pages
```

## Troubleshooting

**Build fails:**
- Check that all secrets are set correctly
- Check the Actions tab for error messages

**Site shows 404:**
- Make sure the `base` path in `vite.config.js` matches your repo name
- Check that GitHub Pages is enabled

**Environment variables not working:**
- Make sure secrets are named exactly: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUD_WS_URL`
- They must start with `VITE_` to be included in the build

## Your Site URL

After deployment, your site will be at:
- `https://yourusername.github.io/ManeuverPrototype/`

Replace `yourusername` with your GitHub username.

