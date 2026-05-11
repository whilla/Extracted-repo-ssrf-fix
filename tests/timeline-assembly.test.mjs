import { TimelineAssemblyService } from '../lib/services/timelineAssemblyService.js';

async function testAssembly() {
  console.log('🚀 Starting Timeline Assembly Test...');

  const timeline = {
    id: 'test_timeline',
    name: 'Test Timeline',
    duration: 5,
    aspectRatio: '16:9',
    tracks: [
      {
        id: 'track_v_1',
        name: 'Video',
        type: 'video',
        events: [
          {
            id: 'event_v_1',
            startTime: 0,
            duration: 5,
            type: 'video',
            assetUrl: 'https://sample-videos.com/video123/mp4/720p/big_buck_bunny_720p_1mb.mp4',
            assetType: 'video'
          }
        ]
      },
      {
        id: 'track_t_1',
        name: 'Text',
        type: 'text',
        events: [
          {
            id: 'event_t_1',
            startTime: 1,
            duration: 3,
            type: 'text',
            text: 'Hello from NexusAI!',
            fontSize: 64,
            color: 'white',
            textAlign: 'center'
          }
        ]
      }
    ]
  };

  console.log('Timeline created. Starting assembly (this may take a while)...');

  try {
    const result = await TimelineAssemblyService.assembleTimeline({
      timeline,
      generationId: 'test_gen_123'
    });
    console.log('Result:', result);
  } catch (error) {
    console.log('Expected failure in headless environment:', error.message);
  }
}

testAssembly();
