import { logger } from '@/lib/utils/logger';
import { kvGet, kvSet, writeFile, PATHS } from './puterService';

export type SpatialContentType = '3d_model' | 'ar_filter' | 'vr_environment' | 'hologram';

export interface SpatialContentParams {
  type: SpatialContentType;
  prompt?: string;
  style?: 'realistic' | 'cartoon' | 'abstract' | 'low_poly';
  colors?: string[];
  animation?: 'static' | 'idle' | 'bounce' | 'rotate';
  outputFormat?: 'glb' | 'gltf' | 'usdz' | 'aframe';
}

export interface SpatialContentResult {
  success: boolean;
  modelUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface ARFilterParams {
  effectName: string;
  trigger?: 'face' | 'hand' | 'body' | 'world';
  intensity?: number;
  anchors?: string[];
}

export interface VREnvironmentParams {
  sceneType: 'room' | 'landscape' | 'space' | 'abstract';
  lighting?: 'day' | 'night' | 'sunset' | 'custom';
  interactiveElements?: string[];
}

/**
 * Generates self-contained HTML files with embedded Three.js for 3D, AR, and VR content.
 * These can be served as standalone experiences or embedded via iframe.
 */
export class SpatialContentService {
  private static readonly THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  private static readonly STORAGE_PREFIX = 'spatial/';

  static async generate3DModel(params: {
    prompt: string;
    style?: 'realistic' | 'cartoon' | 'abstract' | 'low_poly';
    outputFormat?: 'glb' | 'gltf';
  }): Promise<SpatialContentResult> {
    try {
      logger.info('[SpatialContentService] Generating 3D model via Replicate or procedural Three.js', params);

      const replicateKey = await kvGet('replicate_api_key');
      if (replicateKey) {
        const replicateModel = await kvGet('replicate_3d_model') || 'fictiverse/3d-model-generator:3d-model-generator-v1';
        try {
          const response = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${replicateKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: replicateModel.includes(':') ? replicateModel.split(':')[1] : replicateModel,
              input: {
                prompt: params.prompt,
                ...(params.outputFormat ? { output_format: params.outputFormat } : {}),
              },
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const predictionId = data.id;

            for (let i = 0; i < 60; i++) {
              await new Promise(r => setTimeout(r, 3000));
              const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: { 'Authorization': `Bearer ${replicateKey}` },
              });
              const statusData = await statusRes.json();
              if (statusData.status === 'succeeded' && statusData.output) {
                const modelUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
                return { success: true, modelUrl: String(modelUrl), thumbnailUrl: String(modelUrl).replace(/\.glb$/, '.png') };
              }
              if (statusData.status === 'failed') break;
            }
          }
        } catch {
          logger.warn('SpatialContentService', 'Replicate API call failed, falling back to procedural generation');
        }
      }

      // Fallback: generate procedural Three.js scene as HTML
      const style = params.style || 'abstract';
      const colors = this.generateColorPalette(style);
      const html = this.buildThreeJsScene({
        sceneType: 'abstract',
        geometry: 'torus',
        colors,
        animation: 'rotate',
        prompt: params.prompt,
      });

      const fileId = `3d_${Date.now()}`;
      const fileName = `${this.STORAGE_PREFIX}${fileId}.html`;
      await writeFile(fileName, html);

      return {
        success: true,
        modelUrl: fileName,
        thumbnailUrl: undefined,
      };
    } catch (error) {
      logger.error('[SpatialContentService] 3D generation error', error instanceof Error ? error.message : String(error));
      return { success: false, error: error instanceof Error ? error.message : '3D generation failed' };
    }
  }

  static async generateARFilter(params: ARFilterParams): Promise<SpatialContentResult> {
    try {
      logger.info('[SpatialContentService] Generating AR filter', params as any);

      const colors = this.generateColorPalette('cartoon');
      const html = this.buildThreeJsScene({
        sceneType: 'ar',
        geometry: 'face',
        colors,
        animation: 'idle',
        effectName: params.effectName,
        trigger: params.trigger,
      });

      const fileId = `ar_${Date.now()}`;
      const fileName = `${this.STORAGE_PREFIX}${fileId}.html`;
      await writeFile(fileName, html);

      return { success: true, modelUrl: fileName };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'AR filter generation failed' };
    }
  }

  static async generateVREnvironment(params: VREnvironmentParams): Promise<SpatialContentResult> {
    try {
      logger.info('[SpatialContentService] Generating VR environment', params as any);

      const lighting = params.lighting || 'day';
      const colors = this.generateColorPalette(lighting);
      const sceneGeo = params.sceneType === 'room' ? 'box' : params.sceneType === 'landscape' ? 'terrain' : 'sphere';
      const interactiveHtml = (params.interactiveElements || []).length > 0
        ? `<script>${this.buildInteractiveScript(params.interactiveElements || [])}</script>`
        : '';

      const vrButtonHtml = `typeof THREE !== 'undefined' && 'xr' in navigator ? '<button id="vr-btn" style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:12px 24px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;z-index:20;display:none">Enter VR</button>' : ''`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VR Environment - ${params.sceneType}</title>
<style>body{margin:0;overflow:hidden;font-family:sans-serif;background:#000}#info{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.8);font-size:14px;pointer-events:none;z-index:10}</style>
</head>
<body>
<div id="info">VR Environment • ${params.sceneType} • Drag to look around • Scroll to zoom • ${'${vrButtonHtml}'}</div>
<script src="${this.THREE_CDN}"></script>
<script>
const scene = new THREE.Scene();
scene.background = new THREE.Color(${lighting === 'night' ? "'#0a0a2e'" : lighting === 'sunset' ? "'#ff6b35'" : "'#87CEEB'"});
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 20, 10);
light.castShadow = true;
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040, 0.5));
const hemi = new THREE.HemisphereLight(0x87CEEB, 0x362211, 0.6);
scene.add(hemi);

// Ground
const groundGeo = new THREE.PlaneGeometry(50, 50);
const groundMat = new THREE.MeshStandardMaterial({color: 0x3a7d44, roughness: 0.8});
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ${params.sceneType === 'room' ? 'Room walls' : params.sceneType === 'landscape' ? 'Terrain features' : 'Environment objects'}
const geo = new THREE.${sceneGeo === 'terrain' ? 'CylinderGeometry(3, 4, 2, 8)' : sceneGeo === 'sphere' ? 'SphereGeometry(2, 32, 32)' : 'BoxGeometry(2, 2, 2)'};
const mat = new THREE.MeshStandardMaterial({color: ${colors[0]}, roughness: 0.3, metalness: 0.1});
const mesh = new THREE.Mesh(geo, mat);
mesh.position.y = ${sceneGeo === 'terrain' ? '1' : '2'};
mesh.castShadow = true;
scene.add(mesh);

${this.buildVRDecorations(colors)}

const controls = {isDragging:false,prevX:0,prevY:0,yaw:0,pitch:0,zoom:15};
renderer.domElement.addEventListener('mousedown',e=>{controls.isDragging=true;controls.prevX=e.clientX;controls.prevY=e.clientY});
window.addEventListener('mousemove',e=>{if(!controls.isDragging)return;const dx=e.clientX-controls.prevX;const dy=e.clientY-controls.prevY;controls.yaw+=dx*0.005;controls.pitch=Math.max(-1,Math.min(1,controls.pitch+dy*0.005));controls.prevX=e.clientX;controls.prevY=e.clientY});
window.addEventListener('mouseup',()=>{controls.isDragging=false});
window.addEventListener('wheel',e=>{controls.zoom=Math.max(3,Math.min(50,controls.zoom+e.deltaY*0.01))});

window.addEventListener('load',()=>{
  const vrBtn = document.getElementById('vr-btn');
  if(vrBtn && navigator.xr) {vrBtn.style.display='block';vrBtn.onclick=()=>{renderer.xr.enabled=true;renderer.xr.setSession(navigator.xr.requestSession('immersive-vr'));}}
});
function animate() {
  renderer.setAnimationLoop(() => {
    mesh.rotation.y += 0.003;
    camera.position.x = controls.zoom * Math.sin(controls.yaw) * Math.cos(controls.pitch);
    camera.position.y = controls.zoom * Math.sin(controls.pitch) + 3;
    camera.position.z = controls.zoom * Math.cos(controls.yaw) * Math.cos(controls.pitch);
    camera.lookAt(0, 1, 0);
    renderer.render(scene, camera);
  });
}
animate();
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)});
</script>
${interactiveHtml}
</body>
</html>`;

      const fileId = `vr_${Date.now()}`;
      const fileName = `${this.STORAGE_PREFIX}${fileId}.html`;
      await writeFile(fileName, html);

      return { success: true, modelUrl: fileName };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'VR environment generation failed' };
    }
  }

  static async generateHologram(params: {
    subject: string;
    animation?: 'static' | 'idle' | 'bounce' | 'rotate';
  }): Promise<SpatialContentResult> {
    try {
      logger.info('[SpatialContentService] Generating hologram', params);

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hologram - ${params.subject}</title>
<style>body{margin:0;overflow:hidden;background:#000}canvas{display:block}</style>
</head>
<body>
<script src="${this.THREE_CDN}"></script>
<script>
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Hologram material with glow effect
const holoMat = new THREE.MeshPhongMaterial({
  color: 0x00ffff,
  emissive: 0x00ffff,
  emissiveIntensity: 0.3,
  transparent: true,
  opacity: 0.6,
  wireframe: false,
  shininess: 60,
});
const wireMat = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  wireframe: true,
  transparent: true,
  opacity: 0.2,
});

const group = new THREE.Group();
const geo = new THREE.OctahedronGeometry(1.5, 0);
const mainMesh = new THREE.Mesh(geo, holoMat);
const wireMesh = new THREE.Mesh(geo.clone(), wireMat);
wireMesh.scale.set(1.05, 1.05, 1.05);
group.add(mainMesh);
group.add(wireMesh);

// Scanning line effect
const scanMat = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  transparent: true,
  opacity: 0.15,
});
const scanGeo = new THREE.PlaneGeometry(3.2, 0.05);
const scanLine = new THREE.Mesh(scanGeo, scanMat);
scanLine.position.y = -2;
group.add(scanLine);

scene.add(group);

// Lights
const light = new THREE.DirectionalLight(0x00ffff, 1);
light.position.set(1, 1, 1);
scene.add(light);
const ambient = new THREE.AmbientLight(0x004444, 0.5);
scene.add(ambient);

let time = 0;
function animate() {
  requestAnimationFrame(animate);
  time += 0.01;
  group.rotation.y = time * 0.5;
  group.position.y = Math.sin(time * 0.8) * 0.2;
  scanLine.position.y = -2 + (Math.sin(time * 1.5) + 1) * 2;
  holoMat.opacity = 0.4 + Math.sin(time * 2) * 0.15;
  renderer.render(scene, camera);
}
animate();
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)});
</script>
</body>
</html>`;

      const fileId = `holo_${Date.now()}`;
      const fileName = `${this.STORAGE_PREFIX}${fileId}.html`;
      await writeFile(fileName, html);

      return { success: true, modelUrl: fileName };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Hologram generation failed' };
    }
  }

  static async convertToFormat(
    modelUrl: string,
    targetFormat: 'glb' | 'gltf' | 'usdz'
  ): Promise<SpatialContentResult> {
    try {
      logger.info('[SpatialContentService] Converting model format', { modelUrl, targetFormat });

      // Try cloud conversion API
      const convertKey = await kvGet('spatial_convert_api_key');
      if (convertKey) {
        const response = await fetch('https://api.3dconvert.io/v1/convert', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${convertKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            source: modelUrl,
            target_format: targetFormat,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          return { success: true, modelUrl: data.output_url };
        }
      }

      return {
        success: false,
        error: `Model format conversion to ${targetFormat} requires a 3D conversion API key (spatial_convert_api_key). Configure one in Settings or use tools like https://github.com/AIFahim/three-gltf-transform.`,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Conversion failed' };
    }
  }

  private static generateColorPalette(style: string): string[] {
    const palettes: Record<string, string[]> = {
      realistic: ['0x8B4513', '0x228B22', '0x4169E1', '0x808080', '0xDAA520'],
      cartoon: ['0xFF6B6B', '0x4ECDC4', '0x45B7D1', '0x96CEB4', '0xFFEAA7'],
      abstract: ['0x6C5CE7', '0xA29BFE', '0xFD79A8', '0xFDCB6E', '0x00CEC9'],
      low_poly: ['0x2D3436', '0x636E72', '0xB2BEC3', '0xDFE6E9', '0x74B9FF'],
      day: ['0x87CEEB', '0x228B22', '0x8B4513', '0xFFD700', '0xFFFFFF'],
      night: ['0x0a0a2e', '0x1a1a4e', '0x2a2a6e', '0xFFD700', '0xFFFFFF'],
      sunset: ['0xFF6B35', '0xFF4500', '0x8B0000', '0xFFD700', '0xFF69B4'],
    };
    return palettes[style] || palettes.abstract;
  }

  private static buildThreeJsScene(config: {
    sceneType: string;
    geometry: string;
    colors: string[];
    animation: string;
    prompt?: string;
    effectName?: string;
    trigger?: string;
  }): string {
    const geoMap: Record<string, string> = {
      torus: 'new THREE.TorusKnotGeometry(1.5, 0.5, 100, 16)',
      sphere: 'new THREE.SphereGeometry(1.5, 32, 32)',
      box: 'new THREE.BoxGeometry(2, 2, 2)',
      face: 'new THREE.SphereGeometry(1.2, 32, 32)',
      terrain: 'new THREE.CylinderGeometry(3, 4, 2, 8)',
    };
    const geometry = geoMap[config.geometry] || geoMap.torus;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3D Scene</title>
<style>body{margin:0;overflow:hidden;background:#0a0a0a}canvas{display:block}</style>
</head>
<body>
<script src="${this.THREE_CDN}"></script>
<script>
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const colors = [${config.colors.join(',')}];
const group = new THREE.Group();
const geo = ${geometry};
const mat = new THREE.MeshStandardMaterial({
  color: colors[0],
  roughness: 0.3,
  metalness: 0.7,
  envMapIntensity: 1,
});
const mesh = new THREE.Mesh(geo, mat);
group.add(mesh);

// Particle ring
const particleCount = 500;
const positions = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  const theta = (i / particleCount) * Math.PI * 2;
  const radius = 2.5 + Math.random() * 0.5;
  positions[i * 3] = Math.cos(theta) * radius;
  positions[i * 3 + 1] = Math.sin(theta * 2) * 0.3;
  positions[i * 3 + 2] = Math.sin(theta) * radius;
}
const particleGeo = new THREE.BufferGeometry();
particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const particleMat = new THREE.PointsMaterial({color: colors[1 % colors.length], size: 0.03, transparent: true});
const particles = new THREE.Points(particleGeo, particleMat);
group.add(particles);

scene.add(group);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040, 0.4));

function animate() {
  requestAnimationFrame(animate);
  group.rotation.x += 0.003;
  group.rotation.y += 0.01;
  particles.rotation.y += 0.002;
  renderer.render(scene, camera);
}
animate();
window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight)});
</script>
</body>
</html>`;
  }

  private static buildInteractiveScript(elements: string[]): string {
    const handlers = elements.map(el => {
      if (el.toLowerCase().includes('click')) {
        return `document.addEventListener('click',()=>{alert('Interactive element: ${el}')});`;
      }
      if (el.toLowerCase().includes('hover')) {
        return `document.querySelectorAll('*').forEach(el=>{el.addEventListener('mouseenter',()=>{el.style.opacity='0.8'});el.addEventListener('mouseleave',()=>{el.style.opacity='1'})});`;
      }
      return `console.log('Interactive: ${el}');`;
    }).join('\n');
    return handlers;
  }

  private static buildVRDecorations(colors: string[]): string {
    let deco = '';
    const positions = [
      { x: -5, z: -5 }, { x: 5, z: -5 }, { x: -3, z: 3 }, { x: 3, z: 3 },
      { x: -4, z: -2 }, { x: 4, z: -2 },
    ];
    positions.forEach((pos, i) => {
      const color = colors[i % colors.length];
      deco += `
const decoMat${i} = new THREE.MeshStandardMaterial({color: ${color}, roughness: 0.5});
const deco${i} = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), decoMat${i});
deco${i}.position.set(${pos.x}, 0.3, ${pos.z});
deco${i}.castShadow = true;
scene.add(deco${i});`;
    });
    return deco;
  }
}