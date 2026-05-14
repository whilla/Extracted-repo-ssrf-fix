

export interface DirectedScene {
  index: number;
  title: string;
  description: string;
  cameraMove: 'push-in' | 'tracking' | 'orbit' | 'zoom' | 'shake';
  pacingNote: string;
}

const CAMERA_SEQUENCE: DirectedScene['cameraMove'][] = [
  'push-in',
  'tracking',
  'orbit',
  'zoom',
  'shake',
];

export function directScenes(script: string, maxScenes = 5): DirectedScene[] {
  const lines = script
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxScenes);

  const scenes = lines.length > 0 ? lines : [script.trim()].filter(Boolean);

  return scenes.map((description, index) => ({
    index: index + 1,
    title: `Scene ${index + 1}`,
    description,
    cameraMove: CAMERA_SEQUENCE[index % CAMERA_SEQUENCE.length],
    pacingNote: index === 0 ? 'Open with immediate tension spike.' : index === scenes.length - 1 ? 'End abruptly for loop.' : 'Escalate tension and keep momentum.',
  }));
}
