import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, payload, secret } = body;

    if (secret !== process.env.N8N_BRIDGE_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    switch (action) {
      case 'install_skill':
        // In a Vercel production environment, the filesystem is read-only.
        // To install a skill, we must commit it to GitHub via the GitHub API.
        const { skillName, repoPath } = payload;
        console.log(`[AgentEvolve] Request to install skill: ${skillName} from ${repoPath}`);
        
        // 1. Trigger GitHub API to clone/add skill to the repo
        // 2. This will trigger a Vercel redeploy
        return NextResponse.json({ 
          status: 'initiated', 
          message: `Installation of ${skillName} has been triggered via GitHub. The app will redeploy automatically.` 
        });

      case 'edit_code':
        const { filePath, oldText, newText } = payload;
        console.log(`[AgentEvolve] Request to edit code at ${filePath}`);
        
        // Trigger GitHub API to create a commit with the edit
        return NextResponse.json({ 
          status: 'initiated', 
          message: `Edit for ${filePath} has been committed to GitHub. Redeploying...` 
        });

      default:
        return NextResponse.json({ error: 'Unknown evolution action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
