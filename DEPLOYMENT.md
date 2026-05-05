# NexusAI Vercel Deployment Guide

## Prerequisites
- A [Vercel account](https://vercel.com/signup)
- A [Supabase account](https://supabase.com/dashboard)
- A [Puter account](https://puter.com) (for file storage)
- GitHub/GitLab repository for your project

---

## Step 1: Set Up Supabase
1. **Create a new project** in the [Supabase Dashboard](https://supabase.com/dashboard).
2. **Run the migrations** in the SQL Editor:
   - Copy the contents of [`supabase/migrations/20260424_initial_persistence.sql`](supabase/migrations/20260424_initial_persistence.sql)
   - Copy the contents of [`supabase/migrations/20260504_sovereign_persistence.sql`](supabase/migrations/20260504_sovereign_persistence.sql)
   - Paste and run them in the SQL Editor.
3. **Enable Row-Level Security (RLS)** for all tables:
   - Go to **Authentication > Policies** and enable RLS for `workspaces`, `drafts`, `brand_kits`, etc.
4. **Get your Supabase credentials**:
   - Go to **Project Settings > API** and copy:
     - `Project URL` (use as `NEXT_PUBLIC_SUPABASE_URL`)
     - `anon` key (use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

---

## Step 2: Set Up Puter
1. **Create a Puter app** in the [Puter Dashboard](https://puter.com/dashboard).
2. **Get your Puter App ID**:
   - Go to **App Settings** and copy the `App ID` (use as `NEXT_PUBLIC_PUTER_APP_ID`).

---

## Step 3: Configure Environment Variables
Create a `.env.local` file in the root of your project with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Puter.js Configuration
NEXT_PUBLIC_PUTER_APP_ID=your-puter-app-id

# Vercel Configuration
NEXT_PUBLIC_APP_ENV=production
VERCEL_ENV=production
```

---

## Step 4: Deploy to Vercel
1. **Push your code** to a GitHub/GitLab repository.
2. **Import the project** into Vercel:
   - Go to the [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New Project**.
   - Select your repository and click **Import**.
3. **Configure the project**:
   - **Framework Preset**: Select **Next.js**.
   - **Environment Variables**: Add the variables from `.env.local`.
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
4. **Deploy**: Click **Deploy** and wait for the build to complete.

---

## Step 5: Post-Deployment Steps
1. **Test Supabase Auth**:
   - Visit your deployed app and sign in using the `/login` page.
2. **Test API Routes**:
   - Verify that `GET /api/drafts` returns data.
3. **Test Puter.js Integration**:
   - Upload a file using the Puter.js file uploader (if implemented).
4. **Set Up Cron Jobs**:
   - Go to **Vercel Dashboard > Project > Settings > Cron Jobs** and verify that the `/api/worker/process` job is running daily.

---

## Troubleshooting
### Common Issues
1. **Supabase Connection Errors**:
   - Ensure RLS is enabled for all tables.
   - Verify that the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct.
2. **Puter.js Not Loading**:
   - Ensure the `NEXT_PUBLIC_PUTER_APP_ID` is correct.
   - Check the browser console for errors.
3. **Vercel Build Failures**:
   - Ensure all environment variables are set in the Vercel dashboard.
   - Check the build logs for specific errors.

---

## Next Steps
- [Implement Puter.js file uploads](#)
- [Generate TypeScript types for Supabase](#)
- [Add more API routes](#)