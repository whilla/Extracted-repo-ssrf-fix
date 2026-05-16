/**
 * ActionRegistry defines the mapping between AI-callable tool names 
 * and their corresponding n8n workflow IDs.
 */
export interface AgentAction {
  id: string;
  name: string;
  description: string;
  workflowId: string; // The n8n webhook path/ID
  parameters: Record<string, { type: 'string' | 'number' | 'boolean'; description: string }>;
  requiresApproval: boolean;
}

export const ACTION_REGISTRY: Record<string, AgentAction> = {
  'update_video_timeline': {
    id: 'upd_tim',
    name: 'Update Video Timeline',
    description: 'Modifies the video timeline by adding, moving, resizing, or removing clips.',
    workflowId: 'internal-timeline-update',
    parameters: {
      action: { type: 'string', description: 'add_clip, move_event, resize_event, or remove_event' },
      payload: { type: 'string', description: 'JSON payload with clip details (url, start, duration, etc.)' },
    },
    requiresApproval: false,
  },
  'web_search': {
    id: 'web_src',
    name: 'Web Search',
    description: 'Searches the web for real-time information, trends, and facts.',
    workflowId: 'internal-web-search',
    parameters: {
      query: { type: 'string', description: 'The search query' },
    },
    requiresApproval: false,
  },
  'generate_video': {
    id: 'gen_vid',
    name: 'Generate Video',
    description: 'Generates a short-form video based on a script and brand identity.',
    workflowId: 'workflow-video-generation',
    parameters: {
      script: { type: 'string', description: 'The full script for the video' },
      aspect_ratio: { type: 'string', description: 'e.g., 9:16 for shorts' },
      duration: { type: 'number', description: 'Target duration in seconds' },
    },
    requiresApproval: false,
  },
  'generate_social_copy': {
    id: 'gen_copy',
    name: 'Generate Social Copy',
    description: 'Creates an optimized caption and a set of hashtags for a specific platform.',
    workflowId: 'workflow-caption-generation',
    parameters: {
      video_summary: { type: 'string', description: 'Summary of the video content' },
      platform: { type: 'string', description: 'tiktok, instagram, or youtube' },
      target_audience: { type: 'string', description: 'Who the post is targeting' },
    },
    requiresApproval: false,
  },
  'post_to_social': {
    id: 'post_soc',
    name: 'Post to Social Media',
    description: 'Uploads the video and caption to the specified social platform.',
    workflowId: 'workflow-social-posting',
    parameters: {
      video_url: { type: 'string', description: 'URL of the hosted video file' },
      caption: { type: 'string', description: 'Final caption including hashtags' },
      platform: { type: 'string', description: 'tiktok, instagram, or youtube' },
    },
    requiresApproval: true, // This triggers the /approvals flow
  },
  'schedule_post': {
    id: 'sched_post',
    name: 'Schedule Post',
    description: 'Schedules a post for a future date and time.',
    workflowId: 'workflow-post-scheduler',
    parameters: {
      video_url: { type: 'string', description: 'URL of the hosted video file' },
      caption: { type: 'string', description: 'Final caption' },
      platform: { type: 'string', description: 'tiktok, instagram, or youtube' },
      scheduled_time: { type: 'string', description: 'ISO 8601 timestamp' },
    },
    requiresApproval: true,
  },
  'create_automation_plan': {
    id: 'create_plan',
    name: 'Draft Automation Plan',
    description: 'Create a structured strategic plan with milestones and atomic steps to achieve a high-level goal.',
    workflowId: 'internal-plan-creation', // Handled internally by planService
    parameters: {
      goal: { type: 'string', description: 'The overall objective (e.g. "Grow to 10k followers")' },
      description: { type: 'string', description: 'Detailed context and constraints for the plan' },
      steps: { type: 'string', description: 'JSON string of steps: [{description, action_type, dependencies[]}]' },
    },
    requiresApproval: false,
  },
  'update_plan_progress': {
    id: 'update_progress',
    name: 'Update Plan Progress',
    description: 'Mark a step in the current automation plan as completed or failed.',
    workflowId: 'internal-plan-update',
    parameters: {
      stepId: { type: 'string', description: 'The ID of the step to update' },
      status: { type: 'string', description: 'completed or failed' },
      result: { type: 'string', description: 'Summary of what happened during the step' },
    },
    requiresApproval: false,
  },
  'generate_audio': {
    id: 'gen_audio',
    name: 'Generate Audio',
    description: 'Generates voiceover/narration audio from text using TTS.',
    workflowId: 'internal-audio-generation',
    parameters: {
      text: { type: 'string', description: 'The text to convert to speech' },
      voice: { type: 'string', description: 'Voice style: alloy, echo, fable, nova, shimmer' },
    },
    requiresApproval: false,
  },
  'generate_music': {
    id: 'gen_music',
    name: 'Generate Music',
    description: 'Generates background music based on mood, genre, and content description.',
    workflowId: 'internal-music-generation',
    parameters: {
      prompt: { type: 'string', description: 'Description of the desired music mood/style' },
      genre: { type: 'string', description: 'Genre: cinematic, pop, ambient, orchestral, electronic' },
      duration: { type: 'number', description: 'Duration in seconds' },
    },
    requiresApproval: false,
  },
};
