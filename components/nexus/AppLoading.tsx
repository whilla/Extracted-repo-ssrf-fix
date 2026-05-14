'use client';

import { useEffect, useState } from 'react';
import { LoadingPulse } from './LoadingPulse';
import { Rocket, CheckCircle, AlertTriangle } from 'lucide-react';

export function AppLoading({ message = 'Starting NexusAI...' }: { message?: string }) {
  const [dots, setDots] = useState(1);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  
  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, 500);
    
    // Simulate initialization steps
    const steps = [
      { name: 'Core Systems', duration: 800 },
      { name: 'AI Engine', duration: 1000 },
      { name: 'Interface', duration: 600 },
    ];
    
    let completed = 0;
    steps.forEach((step, index) => {
      setTimeout(() => {
        setStatus('loading');
        setDots(1);
      }, steps.slice(0, index).reduce((sum, s) => sum + s.duration, 0));
      
      setTimeout(() => {
        completed++;
        if (completed === steps.length) {
          setStatus('success');
        }
      }, steps.slice(0, index + 1).reduce((sum, s) => sum + s.duration, 0));
    });
    
    return () => clearInterval(dotInterval);
  }, []);
  
  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Ready to Launch</h2>
          <p className="text-muted-foreground">NexusAI is initialized and ready</p>
        </div>
      </div>
    );
  }
  
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Initialization Failed</h2>
          <p className="text-muted-foreground mb-4">Could not start NexusAI</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20">
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-8 h-8 text-primary animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Starting NexusAI</h2>
        <p className="text-muted-foreground mb-6">
          {message}{' '.repeat(dots)}
        </p>
        <LoadingPulse className="mx-auto" />
      </div>
    </div>
  );
}
