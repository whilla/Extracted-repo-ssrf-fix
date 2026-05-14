

import {
  loadAgentMemory,
  saveAgentMemory,
  setPrimaryNiche,
  addNicheDetail,
  addConversationSummary,
} from './agentMemoryService';
import type { BrandProfile } from './nicheAnalyzerService';

export interface CharacterLockProfile {
  name: string;
  faceSignature: string;
  clothingSignature: string;
  physicalTraits: string[];
  identityVector?: number[];
  referenceDescriptor?: string;
}

export async function persistBrandProfile(profile: BrandProfile): Promise<void> {
  await setPrimaryNiche(profile.niche);
  await addNicheDetail(`Tone: ${profile.tone}`);
  await addNicheDetail(`Goal: ${profile.goal}`);
  await addNicheDetail(`Content Type: ${profile.contentType}`);
  await addNicheDetail(`Audience Intent: ${profile.audienceIntent}`);
  await addConversationSummary(
    `Brand profile locked for ${profile.niche}`,
    [
      `Tone: ${profile.tone}`,
      `Audience: ${profile.audience}`,
      `Goal: ${profile.goal}`,
    ],
    1
  );
}

export async function saveCharacterLock(character: CharacterLockProfile): Promise<void> {
  const memory = await loadAgentMemory();
  const entry = [
    `Character: ${character.name}`,
    `Face: ${character.faceSignature}`,
    `Clothing: ${character.clothingSignature}`,
    `Traits: ${character.physicalTraits.join(', ')}`,
    character.referenceDescriptor ? `Reference: ${character.referenceDescriptor}` : '',
    character.identityVector?.length ? `Identity Vector: ${character.identityVector.slice(0, 6).join(',')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const hasEntry = memory.nicheDetails.some((item) => item === entry);
  if (!hasEntry) {
    memory.nicheDetails = [...memory.nicheDetails.slice(-39), entry];
    await saveAgentMemory(memory);
  }
}
