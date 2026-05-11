import assert from 'node:assert';
import { initializeAgents, createOrchestrationPlan, executeAgentTask, getAgentByRole } from '../lib/services/multiAgentService.ts';
import { TimelineService } from '../lib/services/timelineService.ts';
import { ToolRegistry } from '../lib/services/toolRegistry.ts';

async function testVideoProductionPipeline() {
  console.log('🚀 Starting End-to-End Video Production Pipeline Test...');

  try {
    // 1. Setup
    await initializeAgents();
    const userRequest = 'Create a 15-second high-energy ad for a new organic energy drink called "ZenPulse"';
    const brandContext = { brandName: 'ZenPulse', tone: 'energetic', niche: 'wellness' };

    console.log('Step 1: Planning...');
    const plan = await createOrchestrationPlan(userRequest, 'full');
    console.log('✅ Plan created with', plan.subtasks.length, 'subtasks');
    assert(plan.subtasks.length > 0, 'Plan should have subtasks');

    // 2. Simulate Content Generation
    console.log('Step 2: Generating Content...');
    const generator = await getAgentByRole('generator');
    const contentOutput = await executeAgentTask(
      { 
        id: 'gen-1', 
        role: 'generator', 
        name: 'Generator', 
        promptTemplate: 'Generate a script for {{input}}', 
        scoringWeights: { creativity: 0.2, relevance: 0.3, engagement: 0.3, brandAlignment: 0.2 },
        performanceScore: 80,
        evolutionState: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        capabilities: ['text_generation']
      },
      userRequest,
      { brandVoice: brandContext.tone, audience: 'health-conscious adults' },
      async (p) => `[Script] High-energy cuts of ZenPulse drink with upbeat music. Narrator: "Wake up your soul with ZenPulse!"`
    );
    console.log('✅ Content generated');
    assert(contentOutput.content.length > 0, 'Content should not be empty');

    // 3. Simulate Video Editing (Timeline Generation)
    console.log('Step 3: Creating Video Timeline...');
    const timeline = await TimelineService.createTimeline('ZenPulse Ad', '9:16');
    console.log('✅ Timeline initialized:', timeline.id);
    assert(timeline.id.startsWith('timeline_'), 'Timeline ID should be valid');

    // Use the tool to add a clip
    const tool = ToolRegistry.update_video_timeline;
    const addResult = await tool.execute({
      timelineId: timeline.id,
      action: 'add_clip',
      payload: {
        event: {
          id: 'clip-1',
          startTime: 0,
          duration: 5,
          type: 'video',
          assetUrl: 'https://assets.nexusai.com/zenpulse_hero.mp4',
          assetType: 'video'
        }
      }
    });
    console.log('✅ Clip added via tool');
    assert(addResult.success, 'Tool should successfully add clip');

    const updatedTimeline = await TimelineService.getTimeline(timeline.id);
    assert(updatedTimeline.tracks[0].events.length === 1, 'Timeline should have 1 event');
    assert(updatedTimeline.duration === 5, 'Timeline duration should be updated to 5s');

    console.log('Step 4: Adding Text Overlay...');
    const textResult = await tool.execute({
      timelineId: timeline.id,
      action: 'add_clip',
      payload: {
        event: {
          id: 'text-1',
          startTime: 1,
          duration: 3,
          type: 'text',
          text: 'ZENPULSE: WAKE UP YOUR SOUL',
          fontSize: 48,
          color: '#FFFFFF'
        }
      }
    });
    console.log('✅ Text overlay added');
    assert(textResult.success, 'Tool should successfully add text');

    const finalTimeline = await TimelineService.getTimeline(timeline.id);
    assert(finalTimeline.tracks[2].events.length === 1, 'Text track should have 1 event');
    assert(finalTimeline.duration === 5, 'Timeline duration should still be 5s');

    console.log('\n🎉 ALL PIPELINE STEPS PASSED SUCCESSFULLY!');
  } catch (e) {
    console.error('\n❌ PIPELINE TEST FAILED:');
    console.error(e);
    process.exit(1);
  }
}

testVideoProductionPipeline();
