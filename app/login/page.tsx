"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmail, signUpWithEmail } from '@/lib/supabase-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Chrome } from 'lucide-react';

export default function LoginPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
        toast.success('Account created! Please check your email for verification.');
        router.push('/signup'); // Stay on signup or move to a "verify email" page
      } else {
        await signInWithEmail(email, password);
        // Force a page refresh or use a state update to let AuthContext know we are logged in
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('Auth Error:', error);
      toast.error(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md p-6 space-y-6 bg-card rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-center">{isSignUp ? 'Create Account' : 'Sign In'}</h1>
        <div className="flex justify-center gap-4 mb-4">
          <button 
            onClick={() => setIsSignUp(false)} 
            className={`text-sm font-medium ${!isSignUp ? 'text-primary underline' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign In
          </button>
          <span className="text-muted-foreground">|</span>
          <button 
            onClick={() => setIsSignUp(true)} 
            className={`text-sm font-medium ${isSignUp ? 'text-primary underline' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign Up
          </button>
        </div>
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
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (isSignUp ? 'Creating Account...' : 'Signing In...') : (isSignUp ? 'Sign Up' : 'Sign In')}
          </Button>
        </form>
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
          <p>Don&apos;t have an account? <button onClick={() => router.push('/signup')} className="text-primary hover:underline">Sign Up</button></p>
        </div>
      </div>
    </div>
  );
}