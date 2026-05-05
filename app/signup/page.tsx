"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUpWithEmail, signUpWithMagicLink } from '@/lib/supabase-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Chrome } from 'lucide-react';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [useMagicLink, setUseMagicLink] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (useMagicLink) {
        await signUpWithMagicLink(email);
        toast.success('Magic link sent! Please check your email to verify your account.');
      } else {
        await signUpWithEmail(email, password);
        toast.success('Account created! Please check your email for verification.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-up failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-6 space-y-6 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center">Create Account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {!useMagicLink && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (useMagicLink ? 'Sending Link...' : 'Creating Account...') : (useMagicLink ? 'Sign Up with Magic Link' : 'Sign Up')}
          </Button>
        </form>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={useMagicLink} 
              onChange={(e) => setUseMagicLink(e.target.checked)} 
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span>Use Magic Link (Passwordless)</span>
          </label>
        </div>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full" 
          onClick={async () => {
            try {
              await import('@/lib/supabase-auth').then(auth => auth.signInWithGoogle());
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Google sign-in failed');
            }
          }}
        >
          <Chrome className="mr-2 h-4 w-4" />
          Google
        </Button>
        <div className="text-center text-sm">
          <p>Already have an account? <button onClick={() => router.push('/login')} className="text-primary hover:underline">Sign In</button></p>
        </div>
      </div>
    </div>
  );
}
