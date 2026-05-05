# NexusAI Simplified Setup Guide

## Current Issues Identified:

1. **Puter.js Dependency**: The app heavily relies on Puter.js which causes initialization failures
2. **Complex AI Orchestration**: Over-engineered agent systems with circular dependencies
3. **Missing Configuration**: Requires multiple API keys that most users don't have
4. **Termux Compatibility**: Specific issues with Termux environment detection

## Simplified Setup Instructions:

### Option 1: Run Basic Version (Recommended)

1. **Install dependencies:**
   ```bash
   cd extracted-repo
   npm install
   ```

2. **Create minimal .env file:**
   ```bash
   cp .env.example .env
   # Edit .env and add at least:
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
   ```

3. **Disable Puter.js (temporary fix):**
   Edit `app/page.tsx` and comment out Puter-related code:
   ```typescript
   // Remove or comment out these lines:
   // import { getPuterAuthDiagnostics, waitForPuter } from '@/lib/services/puterService';
   // const [puterReady, setPuterReady] = useState(false);
   // Puter initialization logic in useEffect
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

### Option 2: Create Minimal Working Version

If you want a simpler version that actually works:

1. **Create a new minimal page:**
   ```bash
   cp app/page.tsx app/page.backup.tsx
   ```

2. **Replace with simple landing page:**
   ```typescript
   // Simple working version of app/page.tsx
   'use client';
   
   import { useRouter } from 'next/navigation';
   import { useAuth } from '@/lib/context/AuthContext';
   
   export default function SimpleLanding() {
     const router = useRouter();
     const { isAuthenticated } = useAuth();
     
     if (isAuthenticated) {
       router.push('/dashboard');
       return null;
     }
     
     return (
       <div className="min-h-screen flex items-center justify-center">
         <div className="text-center">
           <h1 className="text-3xl font-bold mb-4">NexusAI</h1>
           <p className="mb-6">Simplified version - working!</p>
           <button 
             onClick={() => router.push('/dashboard')}
             className="bg-blue-500 text-white px-4 py-2 rounded"
           >
             Enter Dashboard
           </button>
         </div>
       </div>
     );
   }
   ```

3. **Simplify layout.tsx:**
   Remove Puter script and complex bootstrap logic

### Option 3: Focus on Specific Features

Instead of trying to run the entire app, focus on specific features:

1. **Run just the AI services:**
   ```bash
   node lib/services/aiService.ts
   ```

2. **Test individual components:**
   ```bash
   npm run dev -- --isolate-components
   ```

## Troubleshooting:

### If you get "Puter not ready" errors:
- The app expects Puter.js to be available
- Either install Puter.js or disable Puter-related features
- Check browser console for Puter initialization errors

### If authentication fails:
- Ensure Supabase URL and key are correct
- Check network tab for failed Supabase requests
- Try disabling authentication temporarily for development

### If AI features don't work:
- Add at least one AI provider API key
- Check which specific AI features you need
- Start with basic features before complex orchestration

## Recommended Approach:

1. **Start with Option 2** - Create minimal working version
2. **Gradually add features** back as you get them working
3. **Focus on core functionality** first (dashboard, basic AI)
4. **Add complex features** later (Puter, advanced orchestration)
5. **Test in regular browser** before Termux

The application is very ambitious but overly complex. Starting with a simplified version and gradually adding features is the most reliable approach.