

import type { DirectedScene } from './sceneDirectorService';

export interface VisualPromptPackage {
  imagePrompts: string[];
  videoPrompts: string[];
}

export function buildVisualPromptPackage(
  scenes: DirectedScene[],
  styleTags: string[],
  characterLock?: string
): VisualPromptPackage {
  const style = styleTags.length > 0 ? styleTags.join(', ') : 'cinematic realism';
  const lock = characterLock ? ` Character lock: ${characterLock}.` : '';
  const realismGuard =
    'Photorealistic, premium cinematic finish, natural skin texture, grounded lighting, clean depth separation, no illustration, no cartoon look, no plastic CGI feel.';

  const imagePrompts = scenes.map((scene) =>
    `${scene.title}. Subject and action: ${scene.description}. Camera: ${scene.cameraMove}. Composition: vertical-safe framing, decisive focal subject, layered foreground/background depth. Style: ${style}. Lighting: motivated practical light with believable contrast and atmosphere. ${realismGuard}${lock}`
  );

  const videoPrompts = scenes.map((scene) =>
    `${scene.title}. Scene action: ${scene.description}. Camera movement: ${scene.cameraMove}. Pacing: ${scene.pacingNote}. Direction: stable motion, readable blocking, cinematic realism, loop-friendly final beat, no stylized AI wobble. Style: ${style}. ${realismGuard}${lock}`
  );

  return { imagePrompts, videoPrompts };
}
