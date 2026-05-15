export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

async function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key);
}

async function createGitHubCommit(owner: string, repo: string, branch: string, path: string, content: string, message: string, githubToken: string) {
  const encodedContent = Buffer.from(content).toString('base64');
  
  let sha: string | undefined;
  try {
    const existingRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (existingRes.ok) {
      const existing = await existingRes.json();
      sha = existing.sha;
    }
  } catch {
    // File doesn't exist yet
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: encodedContent,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${err}`);
  }

  return res.json();
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
      }

      const body = await request.json();
      const { action, payload } = body;

      const githubToken = process.env.GITHUB_TOKEN;
      const githubOwner = process.env.GITHUB_REPO_OWNER;
      const githubRepo = process.env.GITHUB_REPO_NAME;
      const githubBranch = process.env.GITHUB_REPO_BRANCH || 'main';

      if (!githubToken || !githubOwner || !githubRepo) {
        return NextResponse.json({
          error: 'GitHub integration not configured. Set GITHUB_TOKEN, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME environment variables.',
        }, { status: 503 });
      }

      switch (action) {
        case 'install_skill': {
          const { skillName, repoPath, skillContent } = payload;
          
          if (!skillName || !repoPath) {
            return NextResponse.json({ error: 'skillName and repoPath are required' }, { status: 400 });
          }

          const content = skillContent || `// ${skillName} - Auto-installed skill\nexport default {};\n`;
          const filePath = `${repoPath}/${skillName}.ts`;
          const commitMessage = `feat: install agent skill "${skillName}"`;

          const result = await createGitHubCommit(githubOwner, githubRepo, githubBranch, filePath, content, commitMessage, githubToken);

          await supabase.from('evolution_logs').insert({
            action: 'install_skill',
            skill_name: skillName,
            file_path: filePath,
            status: 'committed',
            commit_sha: result.commit?.sha,
          });

          return NextResponse.json({ 
            status: 'completed', 
            message: `Skill "${skillName}" committed to GitHub at ${filePath}. Vercel will redeploy automatically.`,
            commit: result.commit?.sha,
          });
        }

        case 'edit_code': {
          const { filePath, newContent, commitMessage } = payload;
          
          if (!filePath || !newContent) {
            return NextResponse.json({ error: 'filePath and newContent are required' }, { status: 400 });
          }

          const message = commitMessage || `feat: update ${filePath} via agent evolution`;
          const result = await createGitHubCommit(githubOwner, githubRepo, githubBranch, filePath, newContent, message, githubToken);

          await supabase.from('evolution_logs').insert({
            action: 'edit_code',
            file_path: filePath,
            status: 'committed',
            commit_sha: result.commit?.sha,
          });

          return NextResponse.json({ 
            status: 'completed', 
            message: `Changes to ${filePath} committed to GitHub. Vercel will redeploy automatically.`,
            commit: result.commit?.sha,
          });
        }

        case 'delete_file': {
          const { filePath, commitMessage } = payload;
          
          if (!filePath) {
            return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
          }

          // Get existing file SHA
          const existingRes = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}?ref=${githubBranch}`, {
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
            },
          });

          if (!existingRes.ok) {
            return NextResponse.json({ error: `File ${filePath} not found in repository` }, { status: 404 });
          }

          const existing = await existingRes.json();

          const res = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${filePath}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: commitMessage || `chore: delete ${filePath} via agent evolution`,
              sha: existing.sha,
              branch: githubBranch,
            }),
          });

          if (!res.ok) {
            const err = await res.text();
            return NextResponse.json({ error: `GitHub API error: ${err}` }, { status: 500 });
          }

          const result = await res.json();

          await supabase.from('evolution_logs').insert({
            action: 'delete_file',
            file_path: filePath,
            status: 'committed',
            commit_sha: result.commit?.sha,
          });

          return NextResponse.json({ 
            status: 'completed', 
            message: `File ${filePath} deleted from GitHub. Vercel will redeploy automatically.`,
            commit: result.commit?.sha,
          });
        }

        default:
          return NextResponse.json({ error: 'Unknown evolution action' }, { status: 400 });
      }
    } catch (error: any) {
      console.error('[api/agent/evolve] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  });
}
