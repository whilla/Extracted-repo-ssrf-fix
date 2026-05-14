

import { PATHS, readFile, writeFile } from './puterService';
import {
  assessWorkerHealth,
  type WorkerHealthAssessment,
  type WorkerHeartbeatRecord,
  type WorkerName,
} from './workerHeartbeatPrimitives';

const HEARTBEAT_PATH = `${PATHS.system}/worker-heartbeats.json`;

interface WorkerHeartbeatStore {
  records: Record<WorkerName, WorkerHeartbeatRecord>;
}

const DEFAULT_STORE: WorkerHeartbeatStore = {
  records: {
    upload_worker: {
      worker: 'upload_worker',
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
    monitor_retry: {
      worker: 'monitor_retry',
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0,
    },
  },
};

async function loadStore(): Promise<WorkerHeartbeatStore> {
  const parsed = await readFile<WorkerHeartbeatStore>(HEARTBEAT_PATH, true);
  if (!parsed || !parsed.records) return structuredClone(DEFAULT_STORE);
  return {
    records: {
      upload_worker: {
        ...DEFAULT_STORE.records.upload_worker,
        ...parsed.records.upload_worker,
      },
      monitor_retry: {
        ...DEFAULT_STORE.records.monitor_retry,
        ...parsed.records.monitor_retry,
      },
    },
  };
}

async function saveStore(store: WorkerHeartbeatStore): Promise<void> {
  await writeFile(HEARTBEAT_PATH, store);
}

export async function recordWorkerStart(
  worker: WorkerName,
  details?: Record<string, unknown>
): Promise<void> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const existing = store.records[worker] || {
    worker,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
  };

  store.records[worker] = {
    ...existing,
    worker,
    lastRunAt: now,
    details: details || existing.details,
  };

  await saveStore(store);
}

export async function recordWorkerCompletion(
  worker: WorkerName,
  input: {
    success: boolean;
    durationMs?: number;
    details?: Record<string, unknown>;
    error?: string;
  }
): Promise<void> {
  const store = await loadStore();
  const now = new Date().toISOString();
  const existing = store.records[worker] || {
    worker,
    successCount: 0,
    failureCount: 0,
    consecutiveFailures: 0,
  };

  const next: WorkerHeartbeatRecord = {
    ...existing,
    worker,
    lastRunAt: now,
    lastDurationMs: input.durationMs,
    details: input.details || existing.details,
  };

  if (input.success) {
    next.successCount = (existing.successCount || 0) + 1;
    next.consecutiveFailures = 0;
    next.lastSuccessAt = now;
    next.lastError = undefined;
  } else {
    next.failureCount = (existing.failureCount || 0) + 1;
    next.consecutiveFailures = (existing.consecutiveFailures || 0) + 1;
    next.lastFailureAt = now;
    next.lastError = input.error || 'Worker execution failed';
  }

  store.records[worker] = next;
  await saveStore(store);
}

export async function getWorkerHeartbeat(worker: WorkerName): Promise<WorkerHeartbeatRecord | null> {
  const store = await loadStore();
  return store.records[worker] || null;
}

export async function getAllWorkerHeartbeats(): Promise<Record<WorkerName, WorkerHeartbeatRecord>> {
  const store = await loadStore();
  return store.records;
}

export async function getWorkerHealthSummary(
  worker: WorkerName
): Promise<WorkerHealthAssessment> {
  const heartbeat = await getWorkerHeartbeat(worker);
  return assessWorkerHealth(heartbeat);
}

