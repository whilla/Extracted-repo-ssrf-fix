import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: { authorization_id?: string }
}) {
  const resolvedParams = await searchParams
  const authorizationId = resolvedParams.authorization_id

  if (!authorizationId) {
    return <div>Error: Missing authorization_id</div>
  }

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=/auth/oauth/consent?authorization_id=${authorizationId}`)
  }

  const { data: authDetails, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)

  if (error || !authDetails) {
    return <div>Error: {error?.message || 'Invalid authorization request'}</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-6 bg-card rounded-lg shadow-lg space-y-6">
        <h1 className="text-2xl font-bold text-center">Authorize {authDetails.client?.name || 'Application'}</h1>
        <p className="text-center text-muted-foreground">This application wants to access your account.</p>
        
        <div className="space-y-4">
          <div>
            <p><strong>Client:</strong> {authDetails.client?.name}</p>
            <p><strong>Redirect URI:</strong> {authDetails.redirect_uri}</p>
          </div>
          
          {authDetails.scope && authDetails.scope.trim() && (
            <div>
              <strong>Requested permissions:</strong>
              <ul className="list-disc list-inside">
                {authDetails.scope.split(' ').map((scopeItem) => (
                  <li key={scopeItem}>{scopeItem}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form action="/api/oauth/decision" method="POST" className="flex gap-4">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button
            type="submit"
            name="decision"
            value="approve"
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Deny
          </button>
        </form>
      </div>
    </div>
  )
}