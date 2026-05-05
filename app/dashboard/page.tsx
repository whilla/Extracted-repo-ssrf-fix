"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase-auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import PuterFileUploader from '@/components/PuterFileUploader';

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();
  const supabase = getSupabaseClient();

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email || '');
    };
    fetchUser();
  }, [router, supabase]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Button variant="outline" onClick={handleSignOut}>
          Sign Out
        </Button>
      </div>
      <p>Welcome, {userEmail}!</p>
      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">File Upload</h2>
        <PuterFileUploader />
      </div>
    </div>
  );
}