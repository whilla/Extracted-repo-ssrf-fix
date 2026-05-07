// Scene Planner Service
// Visual content planning with storyboards, shot lists, and scene breakdowns

import { kvGet, kvSet, writeFile, readFile, listFiles } from './puterService';
import { generateId } from './memoryService';
import { chat } from './aiService';
import { loadBrandKit } from './memoryService';

// Scene Types
export interface Scene {
  id: string;
  order: number;
  title: string;
  description: string;
  duration: number; // in seconds
  shotType: ShotType;
  cameraAngle: CameraAngle;
  lighting: LightingType;
  mood: string;
  props: string[];
  talent: string[];
  dialogue?: string;
  voiceover?: string;
  music?: string;
  soundEffects?: string[];
  textOverlay?: string;
  transitions: {
    in: TransitionType;
    out: TransitionType;
  };
  notes: string;
  thumbnail?: string;
  status: 'draft' | 'approved' | 'filming' | 'editing' | 'complete';
}

export type ShotType = 
  | 'wide' 
  | 'medium' 
  | 'close-up' 
  | 'extreme-close-up' 
  | 'establishing' 
  | 'insert' 
  | 'pov'
  | 'over-shoulder'
  | 'tracking'
  | 'aerial';

export type CameraAngle = 
  | 'eye-level' 
  | 'high-angle' 
  | 'low-angle' 
  | 'dutch-angle' 
  | 'birds-eye' 
  | 'worms-eye';

export type LightingType = 
  | 'natural' 
  | 'studio' 
  | 'dramatic' 
  | 'soft' 
  | 'hard' 
  | 'silhouette'
  | 'golden-hour'
  | 'blue-hour';

export type TransitionType = 
  | 'cut' 
  | 'fade' 
  | 'dissolve' 
  | 'wipe' 
  | 'zoom' 
  | 'slide'
  | 'morph'
  | 'none';

export interface ScenePlan {
  id: string;
  title: string;
  description: string;
  platform: string;
  contentType: 'reel' | 'tiktok' | 'youtube-short' | 'youtube-long' | 'story' | 'ad' | 'tutorial' | 'storytelling_animated' | 'conversational';
  targetDuration: number;
  scenes: Scene[];
  hooks: string[];
  callToAction: string;
  hashtags: string[];
  soundtrack?: {
    genre: string;
    mood: string;
    suggestions: string[];
  };
  equipmentNeeded: string[];
  estimatedBudget?: string;
  createdAt: string;
  updatedAt: string;
  status: 'planning' | 'pre-production' | 'production' | 'post-production' | 'published';
}

// Storage
const SCENE_PLANS_KEY = 'nexus_scene_plans';

// Load all scene plans
export async function loadScenePlans(): Promise<ScenePlan[]> {
  try {
    const data = await kvGet(SCENE_PLANS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save scene plans
async function saveScenePlans(plans: ScenePlan[]): Promise<void> {
  await kvSet(SCENE_PLANS_KEY, JSON.stringify(plans));
}

// Get scene plan by ID
export async function getScenePlan(id: string): Promise<ScenePlan | null> {
  const plans = await loadScenePlans();
  return plans.find(p => p.id === id) || null;
}

// Create new scene plan
export async function createScenePlan(
  input: {
    title: string;
    description: string;
    platform: string;
    contentType: ScenePlan['contentType'];
    targetDuration: number;
  }
): Promise<ScenePlan> {
  const plan: ScenePlan = {
    id: generateId(),
    ...input,
    scenes: [],
    hooks: [],
    callToAction: '',
    hashtags: [],
    equipmentNeeded: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'planning',
  };
  
  const plans = await loadScenePlans();
  plans.push(plan);
  await saveScenePlans(plans);
  
  return plan;
}

// Update scene plan
export async function updateScenePlan(
  id: string,
  updates: Partial<ScenePlan>
): Promise<ScenePlan | null> {
  const plans = await loadScenePlans();
  const index = plans.findIndex(p => p.id === id);
  
  if (index === -1) return null;
  
  plans[index] = {
    ...plans[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  await saveScenePlans(plans);
  return plans[index];
}

// Delete scene plan
export async function deleteScenePlan(id: string): Promise<boolean> {
  const plans = await loadScenePlans();
  const filtered = plans.filter(p => p.id !== id);
  
  if (filtered.length === plans.length) return false;
  
  await saveScenePlans(filtered);
  return true;
}

// Add scene to plan
export async function addScene(
  planId: string,
  scene: Omit<Scene, 'id' | 'order'>
): Promise<Scene | null> {
  const plan = await getScenePlan(planId);
  if (!plan) return null;
  
  const newScene: Scene = {
    ...scene,
    id: generateId(),
    order: plan.scenes.length + 1,
  };
  
  plan.scenes.push(newScene);
  await updateScenePlan(planId, { scenes: plan.scenes });
  
  return newScene;
}

// Update scene
export async function updateScene(
  planId: string,
  sceneId: string,
  updates: Partial<Scene>
): Promise<Scene | null> {
  const plan = await getScenePlan(planId);
  if (!plan) return null;
  
  const sceneIndex = plan.scenes.findIndex(s => s.id === sceneId);
  if (sceneIndex === -1) return null;
  
  plan.scenes[sceneIndex] = {
    ...plan.scenes[sceneIndex],
    ...updates,
  };
  
  await updateScenePlan(planId, { scenes: plan.scenes });
  return plan.scenes[sceneIndex];
}

// Reorder scenes
export async function reorderScenes(
  planId: string,
  sceneIds: string[]
): Promise<boolean> {
  const plan = await getScenePlan(planId);
  if (!plan) return false;
  
  const reorderedScenes = sceneIds.map((id, index) => {
    const scene = plan.scenes.find(s => s.id === id);
    if (!scene) return null;
    return { ...scene, order: index + 1 };
  }).filter(Boolean) as Scene[];
  
  if (reorderedScenes.length !== plan.scenes.length) return false;
  
  await updateScenePlan(planId, { scenes: reorderedScenes });
  return true;
}

// AI-powered scene generation
export async function generateSceneBreakdown(
  concept: string,
  options: {
    platform: string;
    contentType: ScenePlan['contentType'];
    targetDuration: number;
    style?: string;
  }
): Promise<ScenePlan> {
  const brandKit = await loadBrandKit();
  
  const prompt = `Generate a detailed scene-by-scene breakdown for a ${options.contentType} video.

Concept: ${concept}
Platform: ${options.platform}
Target Duration: ${options.targetDuration} seconds
${options.style ? `Style: ${options.style}` : ''}
${brandKit ? `Brand: ${brandKit.brandName}, Tone: ${brandKit.tone}` : ''}

Return a JSON object with this exact structure:
{
  "title": "Video title",
  "description": "Brief description",
  "hooks": ["Hook 1", "Hook 2", "Hook 3"],
  "callToAction": "CTA text",
  "hashtags": ["hashtag1", "hashtag2"],
  "soundtrack": {
    "genre": "Genre",
    "mood": "Mood",
    "suggestions": ["Song 1", "Song 2"]
  },
  "equipmentNeeded": ["Equipment 1", "Equipment 2"],
  "scenes": [
    {
      "title": "Scene title",
      "description": "What happens in this scene",
      "duration": 5,
      "shotType": "close-up",
      "cameraAngle": "eye-level",
      "lighting": "natural",
      "mood": "energetic",
      "props": ["prop1"],
      "talent": ["main presenter"],
      "dialogue": "What they say",
      "voiceover": "VO text if any",
      "textOverlay": "Text shown on screen",
      "transitions": {"in": "cut", "out": "cut"},
      "notes": "Production notes"
    }
  ]
}

Create ${Math.ceil(options.targetDuration / 5)}-${Math.ceil(options.targetDuration / 3)} scenes that flow naturally.`;

  try {
    const response = await chat(prompt, { model: 'gpt-4o', avoidPuter: true });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid response format');
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    // Create the scene plan
    const plan = await createScenePlan({
      title: parsed.title || concept,
      description: parsed.description || concept,
      platform: options.platform,
      contentType: options.contentType,
      targetDuration: options.targetDuration,
    });
    
    // Add generated data
    await updateScenePlan(plan.id, {
      hooks: parsed.hooks || [],
      callToAction: parsed.callToAction || '',
      hashtags: parsed.hashtags || [],
      soundtrack: parsed.soundtrack,
      equipmentNeeded: parsed.equipmentNeeded || [],
      scenes: (parsed.scenes || []).map((scene: Partial<Scene>, index: number) => ({
        id: generateId(),
        order: index + 1,
        title: scene.title || `Scene ${index + 1}`,
        description: scene.description || '',
        duration: scene.duration || 5,
        shotType: scene.shotType || 'medium',
        cameraAngle: scene.cameraAngle || 'eye-level',
        lighting: scene.lighting || 'natural',
        mood: scene.mood || 'neutral',
        props: scene.props || [],
        talent: scene.talent || [],
        dialogue: scene.dialogue,
        voiceover: scene.voiceover,
        textOverlay: scene.textOverlay,
        transitions: scene.transitions || { in: 'cut', out: 'cut' },
        notes: scene.notes || '',
        status: 'draft',
      })),
    });
    
    return (await getScenePlan(plan.id))!;
  } catch (error) {
    console.error('Scene generation error:', error);
    // Return empty plan on error
    return createScenePlan({
      title: concept,
      description: concept,
      platform: options.platform,
      contentType: options.contentType,
      targetDuration: options.targetDuration,
    });
  }
}

// Generate shot list
export async function generateShotList(planId: string): Promise<string> {
  const plan = await getScenePlan(planId);
  if (!plan) return '';
  
  let shotList = `# Shot List: ${plan.title}\n`;
  shotList += `Platform: ${plan.platform} | Type: ${plan.contentType} | Duration: ${plan.targetDuration}s\n\n`;
  
  let totalDuration = 0;
  
  plan.scenes.forEach((scene, index) => {
    shotList += `## Scene ${index + 1}: ${scene.title}\n`;
    shotList += `- Duration: ${scene.duration}s (${totalDuration}s - ${totalDuration + scene.duration}s)\n`;
    shotList += `- Shot: ${scene.shotType} | Angle: ${scene.cameraAngle}\n`;
    shotList += `- Lighting: ${scene.lighting} | Mood: ${scene.mood}\n`;
    if (scene.talent.length) shotList += `- Talent: ${scene.talent.join(', ')}\n`;
    if (scene.props.length) shotList += `- Props: ${scene.props.join(', ')}\n`;
    if (scene.dialogue) shotList += `- Dialogue: "${scene.dialogue}"\n`;
    if (scene.voiceover) shotList += `- VO: "${scene.voiceover}"\n`;
    if (scene.textOverlay) shotList += `- Text: "${scene.textOverlay}"\n`;
    shotList += `- Transition: ${scene.transitions.in} → ${scene.transitions.out}\n`;
    if (scene.notes) shotList += `- Notes: ${scene.notes}\n`;
    shotList += '\n';
    totalDuration += scene.duration;
  });
  
  shotList += `---\nTotal Duration: ${totalDuration}s\n`;
  shotList += `Equipment: ${plan.equipmentNeeded.join(', ')}\n`;
  
  return shotList;
}

// Export scene plan as script
export async function exportAsScript(planId: string): Promise<string> {
  const plan = await getScenePlan(planId);
  if (!plan) return '';
  
  let script = `# ${plan.title}\n\n`;
  script += `${plan.description}\n\n`;
  script += `---\n\n`;
  
  plan.scenes.forEach((scene, index) => {
    script += `**SCENE ${index + 1}: ${scene.title.toUpperCase()}**\n\n`;
    script += `[${scene.shotType.toUpperCase()} SHOT - ${scene.cameraAngle.toUpperCase()}]\n`;
    script += `[${scene.lighting.toUpperCase()} LIGHTING]\n\n`;
    
    if (scene.voiceover) {
      script += `VOICEOVER:\n${scene.voiceover}\n\n`;
    }
    
    if (scene.dialogue) {
      script += `DIALOGUE:\n${scene.dialogue}\n\n`;
    }
    
    if (scene.textOverlay) {
      script += `[TEXT ON SCREEN: "${scene.textOverlay}"]\n\n`;
    }
    
    script += `---\n\n`;
  });
  
  if (plan.callToAction) {
    script += `**CALL TO ACTION:** ${plan.callToAction}\n\n`;
  }
  
  if (plan.hashtags.length) {
    script += `**HASHTAGS:** ${plan.hashtags.map(h => `#${h}`).join(' ')}\n`;
  }
  
  return script;
}
