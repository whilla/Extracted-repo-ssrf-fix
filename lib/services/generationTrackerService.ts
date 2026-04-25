import { PATHS, readFile, writeFile } from './puterService';

export type GenerationSource = 'studio' | 'automation' | 'agent';
export type GenerationStatus = 'pending' | 'completed' | 'failed';

export interface GenerationRecord {
  id: string;
  fingerprint: string;
  source: GenerationSource;
  taskType: string;
  idea: string;
  platforms: string[];
  status: GenerationStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  artifactId?: string;
  artifactType?: 'draft' | 'automation_output';
}

interface TrackGenerationInput {
  source: GenerationSource;
  taskType: string;
  idea: string;
  platforms?: string[];
  allowRetryFailed?: boolean;
}

const REGISTRY_PATH = `${PATHS.system}/generation-registry.json`;
const COMPLETED_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildFingerprint(input: TrackGenerationInput): string {
  const normalized = JSON.stringify({
    taskType: normalizeValue(input.taskType),
    idea: normalizeValue(input.idea),
    platforms: [...(input.platforms || [])].map(normalizeValue).sort(),
  });

  let hash = 0;
  for (let index = 0; index < normalized.length; index++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }

  return `gen_${Math.abs(hash).toString(16)}`;
}

async function loadRegistry(): Promise<GenerationRecord[]> {
  const records = await readFile<GenerationRecord[]>(REGISTRY_PATH, true);
  return Array.isArray(records) ? records : [];
}

async function saveRegistry(records: GenerationRecord[]): Promise<void> {
  await writeFile(REGISTRY_PATH, records.slice(-300));
}

function isBlockingDuplicate(
  record: GenerationRecord,
  allowRetryFailed: boolean,
  now: number
): boolean {
  if (record.status === 'pending') return true;
  if (record.status === 'failed') return !allowRetryFailed;
  if (record.status === 'completed') {
    return now - new Date(record.updatedAt).getTime() < COMPLETED_DUPLICATE_WINDOW_MS;
  }
  return false;
}

export async function trackGenerationStart(input: TrackGenerationInput): Promise<{
  duplicate: boolean;
  record: GenerationRecord;
}> {
  const now = new Date();
  const nowMs = now.getTime();
  const fingerprint = buildFingerprint(input);
  const records = await loadRegistry();
  const existing = records.find((record) => record.fingerprint === fingerprint);

  if (existing && isBlockingDuplicate(existing, Boolean(input.allowRetryFailed), nowMs)) {
    return { duplicate: true, record: existing };
  }

  if (existing && existing.status === 'failed' && input.allowRetryFailed) {
    existing.status = 'pending';
    existing.updatedAt = now.toISOString();
    existing.attempts += 1;
    existing.lastError = undefined;
    await saveRegistry(records);
    return { duplicate: false, record: existing };
  }

  const record: GenerationRecord = {
    id: `gen_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
    fingerprint,
    source: input.source,
    taskType: input.taskType,
    idea: input.idea.trim(),
    platforms: [...(input.platforms || [])],
    status: 'pending',
    attempts: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  records.push(record);
  await saveRegistry(records);

  return { duplicate: false, record };
}

export async function trackGenerationSuccess(
  generationId: string,
  artifact?: Pick<GenerationRecord, 'artifactId' | 'artifactType'>
): Promise<void> {
  const records = await loadRegistry();
  const record = records.find((entry) => entry.id === generationId);
  if (!record) return;

  record.status = 'completed';
  record.updatedAt = new Date().toISOString();
  record.lastError = undefined;
  record.artifactId = artifact?.artifactId;
  record.artifactType = artifact?.artifactType;

  await saveRegistry(records);
}

export async function trackGenerationFailure(generationId: string, error: string): Promise<void> {
  const records = await loadRegistry();
  const record = records.find((entry) => entry.id === generationId);
  if (!record) return;

  record.status = 'failed';
  record.updatedAt = new Date().toISOString();
  record.lastError = error;

  await saveRegistry(records);
}

export async function getGenerationRegistry(): Promise<GenerationRecord[]> {
  return loadRegistry();
}
