'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface RuntimeIssue {
  code: string;
  severity: 'fatal' | 'warning';
  message: string;
}

interface RuntimeState {
  ready: boolean;
  issues: RuntimeIssue[];
}

function installAbortSignalTimeoutPolyfill(): void {
  if (typeof AbortSignal === 'undefined' || typeof AbortController === 'undefined') return;
  if (typeof AbortSignal.timeout === 'function') return;

  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    window.setTimeout(() => {
      const reason = typeof DOMException === 'function'
        ? new DOMException('TimeoutError', 'TimeoutError')
        : undefined;
      controller.abort(reason);
    }, ms);
    return controller.signal;
  };
}

function probeLocalStorage(): boolean {
  try {
    // Test if localStorage is available and not blocked
    if (typeof window.localStorage === 'undefined') {
      console.warn('[RuntimeReadinessGate] localStorage is not available');
      return false;
    }
    
    // Test with a simple write/read/remove
    const testKey = `nexus:runtime:${Date.now()}`;
    const testValue = 'test';
    
    // Check if localStorage is full or quota exceeded
    const initialLength = window.localStorage.length;
    
    window.localStorage.setItem(testKey, testValue);
    const storedValue = window.localStorage.getItem(testKey);
    window.localStorage.removeItem(testKey);
    
    // Verify the value was actually stored and retrieved
    if (storedValue !== testValue) {
      console.warn('[RuntimeReadinessGate] localStorage write/read failed');
      return false;
    }
    
    // Check if storage length changed as expected
    if (window.localStorage.length !== initialLength) {
      console.warn('[RuntimeReadinessGate] localStorage length mismatch, possible quota issue');
      return false;
    }
    
    console.log('[RuntimeReadinessGate] localStorage probe successful');
    return true;
  } catch (error) {
    console.error('[RuntimeReadinessGate] localStorage probe failed', error);
    return false;
  }
}

function hasRequiredBrowserApis(): boolean {
  return (
    typeof fetch === 'function' &&
    typeof Promise === 'function' &&
    typeof URL === 'function' &&
    typeof Blob === 'function' &&
    typeof AbortController === 'function'
  );
}

function assessRuntime(): RuntimeIssue[] {
  const issues: RuntimeIssue[] = [];
  const protocol = window.location.protocol;

  installAbortSignalTimeoutPolyfill();

  if (protocol === 'file:') {
    issues.push({
      code: 'file-protocol',
      severity: 'fatal',
      message: 'This build must run from an http or https origin. Browser storage, service workers, auth popups, and provider calls are not reliable from file URLs.',
    });
  } else if (protocol !== 'http:' && protocol !== 'https:') {
    issues.push({
      code: 'unsupported-protocol',
      severity: 'fatal',
      message: `Unsupported browser protocol: ${protocol}`,
    });
  }

  if (!hasRequiredBrowserApis()) {
    issues.push({
      code: 'missing-browser-apis',
      severity: 'fatal',
      message: 'This browser is missing required runtime APIs for NexusAI.',
    });
  }

  if (!probeLocalStorage()) {
    issues.push({
      code: 'storage-blocked',
      severity: 'fatal',
      message: 'Site storage is blocked. Enable browser site data or use a normal hosted/dev URL before starting NexusAI.',
    });
  }

  if (!('serviceWorker' in navigator)) {
    issues.push({
      code: 'service-worker-unavailable',
      severity: 'warning',
      message: 'Service workers are unavailable in this browser context. Live app behavior can still run, but offline recovery is limited.',
    });
  }

  if (!('indexedDB' in window)) {
    issues.push({
      code: 'indexeddb-unavailable',
      severity: 'warning',
      message: 'IndexedDB is unavailable in this browser context.',
    });
  }

  return issues;
}

export default function RuntimeReadinessGate({ children }: { children: ReactNode }) {
  const [runtimeState, setRuntimeState] = useState<RuntimeState>({
    ready: true,
    issues: [],
  });
  
  useEffect(() => {
    console.log('[RuntimeReadinessGate] Starting runtime assessment...');
    
    try {
      const issues = assessRuntime();
      console.log('[RuntimeReadinessGate] Runtime assessment completed', { issueCount: issues.length });
      
      const fatalIssues = issues.filter((issue) => issue.severity === 'fatal');
      if (fatalIssues.length > 0) {
        setRuntimeState({ ready: true, issues });
      } else {
        setRuntimeState({ ready: true, issues });
      }

      const warnings = issues.filter((issue) => issue.severity === 'warning');
      if (warnings.length > 0) {
        console.warn('[RuntimeReadinessGate] Non-fatal runtime limitations:', warnings);
      }
    } catch (error) {
      console.error('[RuntimeReadinessGate] Runtime assessment failed', error);
      setRuntimeState({ 
        ready: true, 
        issues: [{
          code: 'assessment-failed',
          severity: 'warning',
          message: `Runtime assessment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      });
    }
  }, []);

  const fatalIssues = useMemo(
    () => runtimeState.issues.filter((issue) => issue.severity === 'fatal'),
    [runtimeState.issues]
  );

  if (fatalIssues.length > 0) {
    return (
      <div
        data-nexus-runtime-gate
        className="min-h-screen bg-background text-foreground flex items-center justify-center p-6"
      >
        <div className="w-full max-w-xl rounded-lg border border-destructive/30 bg-card p-6 shadow-lg">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-md bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">NexusAI cannot start here</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The browser context is blocking a required production runtime dependency.
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {fatalIssues.map((issue) => (
              <div key={issue.code} className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                {issue.message}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
