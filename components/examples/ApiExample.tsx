'use client';

import { useApi } from '@/hooks/useApi';
import { NeonButton } from '@/components/nexus/NeonButton';
import { InlineError } from '@/components/ErrorBoundary';

export function ApiExample() {
  const { apiCall } = useApi();
  
  const fetchData = async () => {
    // Example: Fetch data from an API endpoint
    const result = await apiCall(
      fetch('/api/health').then(res => res.json()),
      {
        showError: true,
        errorMessage: 'Failed to fetch health status',
        onSuccess: (data) => {
          console.log('Success:', data);
          alert('API call successful! Check console for data.');
        },
        onError: (error) => {
          console.error('Error:', error);
        }
      }
    );
    
    return result;
  };
  
  const fetchWithError = async () => {
    // Example: Handle API errors gracefully
    const result = await apiCall(
      fetch('/api/nonexistent').then(res => res.json()),
      {
        showError: true,
        errorMessage: 'Endpoint not found',
        onError: (error) => {
          console.error('Handled error:', error);
        }
      }
    );
    
    if (!result) {
      // Show custom error message
      return;
    }
  };
  
  return (
    <div className="space-y-4 p-4 border border-border rounded-lg">
      <h3 className="text-lg font-semibold">useApi Hook Example</h3>
      
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          The useApi hook automatically:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          <li>Shows global loading indicator during API calls</li>
          <li>Handles errors consistently</li>
          <li>Provides success/error callbacks</li>
          <li>Works with any Promise-based API call</li>
        </ul>
      </div>
      
      <div className="flex gap-2 pt-4">
        <NeonButton onClick={fetchData} className="gap-2">
          Test Successful API Call
        </NeonButton>
        
        <NeonButton onClick={fetchWithError} variant="outline" className="gap-2">
          Test Error Handling
        </NeonButton>
      </div>
      
      <div className="pt-4">
        <InlineError
          message="Note: The global loading indicator appears in the top-right during API calls"
          className="bg-blue-500/10 border-blue-500/20"
        />
      </div>
    </div>
  );
}
