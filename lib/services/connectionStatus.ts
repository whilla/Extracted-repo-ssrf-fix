import { isPuterAvailable } from './puterService';
import { useState, useEffect, useCallback } from 'react';

export type ConnectionStatus = 'online' | 'offline' | 'checking';

export interface UseConnectionStatusReturn {
  status: ConnectionStatus;
  isOnline: boolean;
  isOffline: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  refresh: () => Promise<void>;
}

const CONNECTION_CHECK_INTERVAL = 10000;
const OFFLINE_THRESHOLD = 3;

let consecutiveFailures = 0;
let lastStatus: ConnectionStatus = 'checking';
let lastCheckedTime: Date | null = null;

export function useConnectionStatus(): UseConnectionStatusReturn {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = useCallback(async () => {
    const puterReady = isPuterAvailable();
    
    if (puterReady) {
      consecutiveFailures = 0;
      lastStatus = 'online';
      setStatus('online');
    } else {
      consecutiveFailures++;
      
      if (consecutiveFailures > OFFLINE_THRESHOLD) {
        if (lastStatus !== 'offline') {
          lastStatus = 'offline';
          setStatus('offline');
          console.warn('[ConnectionStatus] Puter appears offline after', consecutiveFailures, 'consecutive failures');
        }
      }
    }
    
    lastCheckedTime = new Date();
    setLastChecked(lastCheckedTime);
  }, []);

  useEffect(() => {
    checkConnection();
    
    const interval = setInterval(checkConnection, CONNECTION_CHECK_INTERVAL);
    
    const handleOnline = () => {
      consecutiveFailures = 0;
      checkConnection();
    };
    
    const handleOffline = () => {
      consecutiveFailures = OFFLINE_THRESHOLD + 1;
      checkConnection();
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkConnection]);

  return {
    status,
    isOnline: status === 'online',
    isOffline: status === 'offline',
    isChecking: status === 'checking',
    lastChecked,
    refresh: checkConnection,
  };
}

export function getConnectionStatus(): ConnectionStatus {
  return lastStatus;
}

export function isConnectionOnline(): boolean {
  return lastStatus === 'online';
}

export function wasRecentlyChecked(): boolean {
  if (!lastCheckedTime) return false;
  const diff = Date.now() - lastCheckedTime.getTime();
  return diff < CONNECTION_CHECK_INTERVAL * 2;
}