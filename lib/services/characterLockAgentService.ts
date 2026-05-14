

export interface CharacterIdentity {
  name: string;
  faceSignature: string;
  clothingSignature: string;
  physicalTraits: string[];
  voiceProfile?: string;
  referenceDescriptor?: string;
  identityVector: number[];
}

function inferName(request: string): string {
  const match = request.match(/\b(?:name|character)\s*(?:is|:)\s*([A-Za-z][A-Za-z0-9 _-]{1,40})/i);
  if (match?.[1]?.trim()) return match[1].trim();

  const leading = request.match(
    /^\s*([A-Z][A-Za-z'-]+(?:\s+(?:[A-Z][A-Za-z'-]+|the|of|da|de|el)){0,4})\s*(?:,|\.)/
  );
  if (leading?.[1]?.trim()) return leading[1].trim();

  return 'Main Character';
}

function inferReferenceDescriptor(request: string): string | undefined {
  const match = request.match(
    /\b(?:reference|look\s+like|same\s+as|based\s+on)\s*(?:image|photo|visual)?\s*(?:is|:)?\s*([^\n.]{5,140})/i
  );
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function hashFloat(seed: string, salt: number): number {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = Math.abs(hash % 1000) / 1000;
  return Number(normalized.toFixed(3));
}

function buildIdentityVector(seed: string, length = 12): number[] {
  const vector: number[] = [];
  for (let index = 0; index < length; index++) {
    vector.push(hashFloat(seed, index + 1));
  }
  return vector;
}

export function createCharacterLock(request: string): CharacterIdentity {
  const lower = request.toLowerCase();
  const traits: string[] = [];
  if (/\bscar\b/.test(lower)) traits.push('visible scar');
  if (/\bhood|cloak|robe\b/.test(lower)) traits.push('signature outerwear');
  if (/\bcurly hair|braid|long\b[^\n,.]{0,16}hair|short\b[^\n,.]{0,16}hair|twisted\b[^\n,.]{0,16}hair\b/.test(lower)) {
    traits.push('distinct hair silhouette');
  }
  if (/\bgreen eyes|blue eyes|brown eyes|dark eyes\b/.test(lower)) traits.push('fixed eye color');
  if (/\bdark skin|brown skin|deep skin tone|melanin\b/.test(lower)) traits.push('fixed skin tone');

  const referenceDescriptor = inferReferenceDescriptor(request);
  const name = inferName(request);
  const faceSignature =
    /(?:face|features)\s*(?:is|are|:)\s*([^\n.]{4,80})/i.exec(request)?.[1]?.trim() ||
    /\b([^.]{0,80}facial[^.]{0,80})\b/i.exec(request)?.[1]?.trim() ||
    /\b([^.]{0,80}intense[^.]{0,80}expression[^.]{0,80})\b/i.exec(request)?.[1]?.trim() ||
    'consistent face geometry and skin texture';
  const clothingSignature =
    /(?:outfit|clothing|wearing)\s*(?:is|:)?\s*([^\n.]{4,90})/i.exec(request)?.[1]?.trim() ||
    /(?:wearing\s+)?([^,.]{0,36}\brobe\b[^,.]{0,36})/i.exec(request)?.[1]?.trim() ||
    'consistent signature outfit';
  const physicalTraits =
    traits.length > 0 ? traits : ['consistent body proportions', 'recognizable silhouette'];
  const voiceProfile =
    /(?:voice|tone)\s*(?:is|:)\s*([^\n.]{4,80})/i.exec(request)?.[1]?.trim() ||
    'calm, grounded, human pacing';
  const identitySeed = [
    name,
    faceSignature,
    clothingSignature,
    physicalTraits.join(','),
    voiceProfile,
    referenceDescriptor || '',
  ].join('|');

  return {
    name,
    faceSignature,
    clothingSignature,
    physicalTraits,
    voiceProfile,
    referenceDescriptor,
    identityVector: buildIdentityVector(identitySeed),
  };
}

export function scoreCharacterConsistency(script: string, character: CharacterIdentity): number {
  const text = script.toLowerCase();
  let score = 100;

  if (!text.includes(character.name.toLowerCase().split(' ')[0])) {
    score -= 25;
  }

  const tokenize = (value: string, limit: number): string[] =>
    value
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ''))
      .filter((token) => token.length >= 5)
      .slice(0, limit);

  const descriptorTokens = [
    ...tokenize(character.faceSignature, 6),
    ...tokenize(character.clothingSignature, 8),
    ...tokenize(character.physicalTraits.join(' '), 8),
  ].filter((token, index, array) => array.indexOf(token) === index);

  const descriptorMatches = descriptorTokens.filter((token) => text.includes(token)).length;
  if (descriptorTokens.length > 0) {
    const coverage = descriptorMatches / descriptorTokens.length;
    if (coverage < 0.12) score -= 20;
    else if (coverage < 0.25) score -= 10;
  }

  const conflictingCharacterMention = /\b(another|new)\s+(man|woman|character|person)\b/i.test(script);
  if (conflictingCharacterMention) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function enforceCharacterLock(prompt: string, character: CharacterIdentity): string {
  return `${prompt}

Character Lock (mandatory):
- Name: ${character.name}
- Face signature: ${character.faceSignature}
- Clothing signature: ${character.clothingSignature}
- Physical traits: ${character.physicalTraits.join(', ')}
- Voice profile: ${character.voiceProfile || 'natural human'}
- Identity anchor vector: [${character.identityVector.join(', ')}]
- Reference descriptor: ${character.referenceDescriptor || 'none provided'}
- Keep this identity consistent across all scenes and regenerated outputs.`;
}
