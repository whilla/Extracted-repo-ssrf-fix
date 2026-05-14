/**
 * NEXUS BRAIN — Self-Contained Rule-Based AI Chat Engine
 *
 * A deterministic, template-driven response generator that works entirely
 * without external AI APIs. It detects intent, extracts context, selects
 * templates, and assembles natural-sounding responses for content creators.
 *
 * Capabilities:
 *   - Brainstorm content ideas, hooks, headlines
 *   - Draft social media posts for any platform
 *   - Suggest hashtags and posting strategies
 *   - Give platform-specific advice
 *   - Critique and improve existing copy
 *   - Explain marketing concepts
 *   - Help define brand voice and content pillars
 *   - Answer help/welcome questions
 */

import type { AIMessage } from '@/lib/types';

export type BrainIntent =
  | 'brainstorm'
  | 'write_post'
  | 'hook'
  | 'strategy'
  | 'critique'
  | 'brand_advice'
  | 'hashtag_suggest'
  | 'explain'
  | 'welcome'
  | 'help'
  | 'schedule'
  | 'platform_tips'
  | 'general';

export interface BrainContext {
  platform?: string;
  tone?: string;
  topic?: string;
  audience?: string;
  brandName?: string;
  niche?: string;
  contentPillars?: string[];
  previousMessages: AIMessage[];
}

export interface BrainResponse {
  text: string;
  intent: BrainIntent;
  confidence: number;
  suggestedActions?: string[];
}

// ─── Intent Detection ──────────────────────────────────────────────

const INTENT_PATTERNS: { intent: BrainIntent; patterns: RegExp[]; weight: number }[] = [
  {
    intent: 'welcome',
    patterns: [/^\s*(hi|hello|hey|howdy|greetings|what's up|yo)\b/i, /^\s*start\b/i, /^\s*begin\b/i],
    weight: 1.0,
  },
  {
    intent: 'help',
    patterns: [/help\b/i, /what can you do/i, /what do you do/i, /commands/i, /features/i, /how does this work/i, /tutorial/i],
    weight: 1.0,
  },
  {
    intent: 'brainstorm',
    patterns: [/brainstorm/i, /ideas?\b/i, /topics?\b/i, /what should i (post|write|create|make)/i, /content ideas/i, /inspiration/i, /stuck/i, /writer['\s]?s block/i],
    weight: 1.0,
  },
  {
    intent: 'write_post',
    patterns: [/write\b/i, /create (a )?(post|caption|tweet|thread|update)/i, /draft/i, /make a (post|tweet)/i, /compose/i, /generate content/i],
    weight: 1.0,
  },
  {
    intent: 'hook',
    patterns: [/hooks?\b/i, /headline/i, /opening line/i, /attention grab/i, /first line/i, /intro/i, /lead/i, /catchy/i],
    weight: 1.0,
  },
  {
    intent: 'strategy',
    patterns: [/strateg/i, /plan\b/i, /content calendar/i, /approach/i, /roadmap/i, /campaign/i, /funnel/i, /pipeline/i],
    weight: 1.0,
  },
  {
    intent: 'critique',
    patterns: [/critique/i, /review/i, /feedback/i, /improve/i, /fix/i, /polish/i, /rewrite/i, /make it better/i, /analyze this/i, /what['\s]?s wrong/i],
    weight: 1.0,
  },
  {
    intent: 'brand_advice',
    patterns: [/brand\b/i, /voice\b/i, /tone\b/i, /identity/i, /personality/i, / positioning/i, /niche\b/i, /target audience/i],
    weight: 1.0,
  },
  {
    intent: 'hashtag_suggest',
    patterns: [/hashtag/i, /tags?\b/i, /discoverability/i, /reach/i, /visibility/i, /trending/i],
    weight: 1.0,
  },
  {
    intent: 'schedule',
    patterns: [/when\b/i, /best time/i, /schedule/i, /posting time/i, /frequency/i, /how often/i, /calendar/i],
    weight: 1.0,
  },
  {
    intent: 'platform_tips',
    patterns: [/instagram\b/i, /tiktok\b/i, /linkedin\b/i, /twitter\b/i, /x\b/i, /facebook\b/i, /youtube\b/i, /threads\b/i, /pinterest\b/i],
    weight: 1.0,
  },
  {
    intent: 'explain',
    patterns: [/how (to|do)/i, /what is/i, /what are/i, /explain/i, /tell me about/i, /why (does|is|do)/i, /meaning of/i],
    weight: 1.0,
  },
];

function detectIntent(message: string): { intent: BrainIntent; confidence: number } {
  const scores = new Map<BrainIntent, number>();

  for (const { intent, patterns, weight } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        scores.set(intent, (scores.get(intent) || 0) + weight);
      }
    }
  }

  // Contextual boosts
  const lower = message.toLowerCase();
  if (lower.includes('post') || lower.includes('caption') || lower.includes('tweet')) {
    scores.set('write_post', (scores.get('write_post') || 0) + 0.3);
  }
  if (lower.includes('idea') || lower.includes('think of') || lower.includes('come up with')) {
    scores.set('brainstorm', (scores.get('brainstorm') || 0) + 0.3);
  }

  let bestIntent: BrainIntent = 'general';
  let bestScore = 0;

  for (const [intent, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Default to general if no strong signal
  if (bestScore < 0.5) {
    bestIntent = 'general';
    bestScore = 0.3;
  }

  return { intent: bestIntent, confidence: Math.min(bestScore, 1.0) };
}

// ─── Context Extraction ────────────────────────────────────────────

function extractContext(message: string, previousMessages: AIMessage[]): BrainContext {
  const lower = message.toLowerCase();
  const context: BrainContext = { previousMessages };

  // Extract platform
  const platformMap: Record<string, string> = {
    instagram: 'instagram', ig: 'instagram',
    tiktok: 'tiktok', tt: 'tiktok',
    linkedin: 'linkedin', li: 'linkedin',
    twitter: 'twitter', x: 'twitter',
    facebook: 'facebook', fb: 'facebook',
    youtube: 'youtube', yt: 'youtube',
    threads: 'threads',
    pinterest: 'pinterest',
  };
  for (const [key, plat] of Object.entries(platformMap)) {
    if (lower.includes(key)) {
      context.platform = plat;
      break;
    }
  }

  // Extract tone
  const tones = ['professional', 'casual', 'witty', 'sarcastic', 'inspirational', 'educational', 'playful', 'bold', 'empathetic', 'authoritative'];
  for (const tone of tones) {
    if (lower.includes(tone)) {
      context.tone = tone;
      break;
    }
  }

  // Extract topic via simple noun-phrase heuristic
  const topicTriggers = ['about', 'on', 'for', 'regarding', 'topic', 'subject'];
  for (const trigger of topicTriggers) {
    const idx = lower.indexOf(trigger);
    if (idx >= 0) {
      const after = message.slice(idx + trigger.length).trim();
      const clean = after.replace(/^[\s:,-]+/, '').split(/[.!?;]/)[0].trim();
      if (clean.length > 2 && clean.length < 80) {
        context.topic = clean;
        break;
      }
    }
  }

  // Try to extract topic from quoted text
  const quoteMatch = message.match(/["""]([^"""]+)["""]/);
  if (quoteMatch && !context.topic) {
    context.topic = quoteMatch[1].trim();
  }

  // Audience hints
  const audiences = ['entrepreneurs', 'developers', 'creators', 'marketers', 'small business', 'startups', 'gen z', 'millennials', 'parents', 'students', 'professionals', 'freelancers'];
  for (const aud of audiences) {
    if (lower.includes(aud)) {
      context.audience = aud;
      break;
    }
  }

  return context;
}

// ─── Knowledge Base ──────────────────────────────────────────────

const PLATFORM_TIPS: Record<string, string[]> = {
  instagram: [
    'Instagram favors Reels and carousel posts. Use the first slide as a scroll-stopper.',
    'Post between 11 AM – 1 PM and 7 PM – 9 PM for highest engagement.',
    'Use 3–5 hashtags in the caption (not 30). Niche tags outperform broad ones.',
    'Your caption should hook in the first 125 characters before the "...more" cut-off.',
  ],
  tiktok: [
    'Tiktok rewards watch-time. Start with a strong visual or text overlay in the first 1 second.',
    '15–30 second videos perform best. Every second should earn the next.',
    'Post between 7 PM – 11 PM. Trending sounds boost discoverability.',
    'Use a pattern interrupt in the first 3 seconds (unexpected visual, bold text, jump cut).',
  ],
  linkedin: [
    'LinkedIn loves personal stories with a lesson. Start with a relatable moment, not a resume.',
    'Tuesday – Thursday, 8 AM – 10 AM is the golden window.',
    'Write in short paragraphs (1–2 lines). White space is your friend.',
    'End with a question or call-to-action to drive comments (LinkedIn weights comments heavily).',
  ],
  twitter: [
    'X (Twitter) threads outperform single tweets. Break complex ideas into 5–10 threaded posts.',
    'The first tweet must stand alone. Assume nobody reads the rest.',
    'Post between 8 AM – 10 AM and 6 PM – 9 PM. Tuesday and Wednesday are strongest.',
    'One strong visual (chart, screenshot, meme) can 3x engagement on a text thread.',
  ],
  youtube: [
    'YouTube is a search engine. Title and first 2 lines of description are SEO-critical.',
    'Retention is king. If viewers drop in the first 30 seconds, the video dies.',
    'Post consistently — weekly beats sporadic daily uploads for the algorithm.',
    'Thumbnails should be readable at 1 inch wide. Big face + 3–4 words max.',
  ],
  facebook: [
    'Facebook Groups drive more organic reach than Pages. Build community, not just broadcast.',
    'Native video (uploaded directly) gets 6x more engagement than shared links.',
    'Ask questions in posts to trigger comments — the algorithm weights conversation heavily.',
  ],
  threads: [
    'Threads rewards text-first content. Long-form thoughts (300–500 words) can go viral.',
    'Reply to larger accounts genuinely — it puts your profile in front of their audience.',
    'No hashtags needed. The algorithm uses semantic matching, not tagging.',
  ],
  general: [
    'Consistency beats perfection. A mediocre post every day beats one masterpiece a month.',
    'Engage in the first 30 minutes after posting. Reply to every early comment.',
    'Repurpose your best content across platforms — resize, reformat, rewrite, republish.',
  ],
};

const HOOK_TEMPLATES: string[] = [
  'Stop doing {topic} the hard way. Here\'s what actually works:',
  'I spent 6 months learning {topic}. Here are the 3 things nobody tells you.',
  'If you\'re struggling with {topic}, read this.',
  'The biggest myth about {topic}? That you need to be an expert to start.',
  '3 {topic} mistakes that are costing you {audience} right now.',
  'Nobody talks about this {topic} secret — but it changes everything.',
  'I asked 50 {audience} about {topic}. Their answers surprised me.',
  'Why your {topic} strategy isn\'t working (and the 5-minute fix).',
  'The {topic} framework that took me from 0 to 10K followers.',
  'If I had to start {topic} from scratch today, here\'s exactly what I\'d do.',
];

const POST_TEMPLATES: Record<string, string[]> = {
  instagram: [
    '{hook}\n\n{body}\n\nSave this for later 📌\n\n{cta}',
    '{hook}\n\n{body}\n\nDrop a {emoji} if you agree!\n\n{cta}',
    '{hook}\n\nSwipe for the full breakdown →\n\n{body}\n\n{cta}',
  ],
  linkedin: [
    '{hook}\n\n{body}\n\nWhat\'s your experience with {topic}? Share in the comments.\n\n{cta}',
    '{hook}\n\n{body}\n\nHere\'s the lesson: {lesson}\n\nAgree or disagree? Let me know below.',
    '{hook}\n\n{body}\n\n3 takeaways:\n1. {takeaway1}\n2. {takeaway2}\n3. {takeaway3}\n\nWhat would you add?',
  ],
  twitter: [
    '{hook}\n\n{body}\n\n{cta}\n\n(Thread 🧵)',
    '10 {topic} tips in 2 minutes:\n\n1. {tip1}\n2. {tip2}\n3. {tip3}\n\n...which one will you try first?',
    'Unpopular opinion: {controversial_take}\n\n{body}\n\nChange my mind.',
  ],
  tiktok: [
    'POV: you finally figured out {topic} after {struggle_time} of trial and error.\n\n{body}\n\n{cta}',
    'Tell me you\'re bad at {topic} without telling me you\'re bad at {topic}.\n\nI\'ll go first: {example}\n\n{body}',
    '3 {topic} hacks that sound fake but actually work:\n\n1. {hack1}\n2. {hack2}\n3. {hack3}\n\nWhich one blew your mind?',
  ],
  general: [
    '{hook}\n\n{body}\n\n{cta}',
    '{hook}\n\n{body}\n\nWhat do you think? Let me know below!',
    '{hook}\n\n{body}\n\nShare this with someone who needs to hear it.',
  ],
};

const CONTENT_IDEAS: string[] = [
  'A "day in the life" behind-the-scenes post about {topic}',
  'A myth-busting carousel: "5 lies about {topic} you still believe"',
  'A before/after transformation story tied to {topic}',
  'A "tools I use" post with your actual {topic} stack and why each matters',
  'A contrarian take: "Why {topic} advice is wrong" with data to back it up',
  'A quick-win tutorial: "Do this in 5 minutes to improve your {topic}"',
  'A user-generated content spotlight: feature a follower\'s {topic} win',
  'A "steal this strategy" post breaking down a successful {topic} campaign',
  'A vulnerability post: "The biggest {topic} mistake I made and what I learned"',
  'A comparison post: "{topic} vs [alternative] — an honest breakdown"',
  'A predictions post: "Where {topic} is headed in the next 12 months"',
  'A resource round-up: "The 7 best free {topic} tools nobody talks about"',
];

const EXPLANATIONS: Record<string, string> = {
  engagement_rate: 'Engagement rate = (likes + comments + shares + saves) ÷ followers × 100. A good rate is 1–3% for most platforms, 3–6% for Instagram, and 0.5–1% for YouTube.',
  ctr: 'CTR (Click-Through Rate) = clicks ÷ impressions. For organic social, 1–2% is solid. For email, 2–5% is strong. For ads, anything above 1% usually means your creative and targeting are aligned.',
  seo: 'SEO (Search Engine Optimization) is the practice of making your content discoverable through search. On social, it means keyword-rich captions, alt text, and trending sounds. On blogs, it means headers, meta descriptions, and backlinks.',
  cta: 'A CTA (Call-To-Action) tells your audience what to do next. Weak CTAs: "Check it out." Strong CTAs: "Comment your biggest challenge below and I\'ll reply with a personalized tip." The stronger the CTA, the higher the engagement.',
  niche: 'Your niche is the intersection of what you know, what you enjoy, and what people will pay attention to. A good niche is specific enough that you become the go-to person, but broad enough that you never run out of content ideas.',
  algorithm: 'The algorithm is a ranking system that predicts what content will keep users on the platform longest. It optimizes for: 1) watch time / scroll time, 2) early engagement velocity, 3) session continuation (does the user keep scrolling after your post?), and 4) relationship signals (do they regularly engage with you?).',
  aida: 'AIDA is a classic marketing framework: Attention → Interest → Desire → Action. Your hook gets Attention, your story builds Interest, your proof creates Desire, and your CTA drives Action.',
  pas: 'PAS is a copywriting formula: Problem → Agitate → Solution. State the problem your audience faces, agitate it (make it feel urgent), then present your solution. It works because people are more motivated to avoid pain than to seek pleasure.',
  brand_voice: 'Brand voice is the consistent personality your content speaks with. It\'s defined by 4 dimensions: tone (formal vs casual), vocabulary (simple vs technical), sentence structure (short vs long), and emotion (warm vs clinical). The key is consistency — your audience should recognize your post without seeing your name.',
};

// ─── Template Engine ───────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function expandTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `{${key}}`);
}

function generateBody(topic: string, platform: string): string {
  const bodies = [
    `Let's talk about ${topic}. Most people overcomplicate it, but the truth is simpler than you think. Focus on consistency, genuine value, and showing up even when engagement is low. That's how you build trust.`,
    `Here's what I've learned about ${topic}: the creators who win aren't necessarily the most talented — they're the most consistent. They show up, iterate, and learn in public. That's the real secret.`,
    `${topic} can feel overwhelming at first, but start small. One post. One insight. One honest story. Momentum builds momentum. You don't need perfection — you need presence.`,
    `When it comes to ${topic}, the biggest competitive advantage is authenticity. Nobody can copy your lived experience. Share your real lessons, your real failures, and your real wins. That's what builds a loyal audience.`,
    `The ${topic} landscape changes fast, but one principle never does: give more value than you ask for. Teach everything you know. The trust you build is worth more than any single conversion.`,
  ];
  return pickRandom(bodies);
}

function generateTakeaway(topic: string, index: number): string {
  const takeaways = [
    `Start before you feel ready — ${topic} rewards action over planning.`,
    `Your unique perspective on ${topic} is your moat. Lean into it.`,
    `Build in public. Share your ${topic} journey, not just the highlight reel.`,
    `Engage with your community daily. ${topic} is a relationship, not a broadcast.`,
    `Repurpose everything. One ${topic} insight can become 5 pieces of content.`,
    `Measure what matters. Follower count is vanity; engagement and retention are sanity.`,
  ];
  return takeaways[index % takeaways.length];
}

function generateHack(topic: string, index: number): string {
  const hacks = [
    `Use the "3-second rule" — if your ${topic} content doesn't hook in 3 seconds, rewrite the opening.`,
    `Batch create. Spend 2 hours on ${topic} content once a week instead of scrambling daily.`,
    `Steal like an artist. Study the top 10 ${topic} creators in your niche, note what works, then add your twist.`,
    `The "one idea per post" rule: if you're explaining more than one ${topic} concept, split it into two posts.`,
    `Post when your audience is online, not when it's convenient for you. Use analytics to find your golden hours.`,
  ];
  return hacks[index % hacks.length];
}

function generateLesson(topic: string): string {
  const lessons = [
    `Consistency beats virality. One viral post changes nothing; a year of consistent posting changes everything.`,
    `Your audience doesn't want perfection — they want relatability.`,
    `The best ${topic} content comes from your own struggles, not textbooks.`,
    `Engagement is a two-way street. You can't expect comments if you never reply.`,
  ];
  return pickRandom(lessons);
}

// ─── Response Generators ───────────────────────────────────────────

function generateWelcome(context: BrainContext): string {
  const greetings = [
    `Hey there! I'm Nexus Brain — your built-in content strategist. I can help you brainstorm ideas, write posts, craft hooks, build strategy, critique copy, and more. No API keys needed. What are we working on today?`,
    `Welcome to NexusAI! I'm your on-device content assistant. I can draft posts, suggest hooks, plan your content calendar, give platform advice, and analyze your copy. What would you like to create?`,
    `Hello! I'm Nexus Brain, your always-available content partner. Whether you need a tweet thread, an Instagram caption, a content strategy, or just fresh ideas — I've got you. What's on your mind?`,
  ];
  return pickRandom(greetings);
}

function generateHelp(): string {
  return `Here's what I can help you with — no API keys required:\n\n` +
    `**Content Creation**\n` +
    `• Write social media posts for any platform\n` +
    `• Brainstorm content ideas and topics\n` +
    `• Craft attention-grabbing hooks and headlines\n` +
    `• Suggest hashtags and posting strategies\n\n` +
    `**Strategy & Growth**\n` +
    `• Build a content calendar approach\n` +
    `• Get platform-specific tips (Instagram, TikTok, LinkedIn, etc.)\n` +
    `• Define your brand voice and content pillars\n` +
    `• Understand engagement, CTR, SEO, and algorithms\n\n` +
    `**Improvement**\n` +
    `• Critique and polish your existing copy\n` +
    `• Rewrite for a different tone or platform\n` +
    `• Explain marketing concepts in plain English\n\n` +
    `Just tell me what you're working on — like "Write me a LinkedIn post about leadership" or "Brainstorm 5 Instagram Reel ideas for a fitness brand."`;
}

function generateBrainstorm(context: BrainContext): string {
  const topic = context.topic || 'your niche';
  const platform = context.platform || 'social media';
  const brand = context.brandName || 'your brand';

  const ideas = CONTENT_IDEAS.map(t => expandTemplate(t, { topic })).slice(0, 5);

  return `Here are 5 content ideas for ${brand} on ${platform} around ${topic}:\n\n` +
    ideas.map((idea, i) => `${i + 1}. ${idea}`).join('\n\n') +
    `\n\n**Pro tip:** Pick the one that feels easiest to execute today. Momentum is more important than perfection. Want me to draft any of these into a full post?`;
}

function generateWritePost(context: BrainContext): string {
  const topic = context.topic || 'your area of expertise';
  const platform = context.platform || 'general';
  const tone = context.tone || 'conversational';

  const hook = expandTemplate(pickRandom(HOOK_TEMPLATES), {
    topic,
    audience: context.audience || 'your audience',
  });

  const body = generateBody(topic, platform);
  const cta = pickRandom([
    'Drop a comment if this resonates with you.',
    'Share this with someone who needs to hear it today.',
    'What\'s your biggest takeaway? Let me know below!',
    'Save this for the next time you need inspiration.',
  ]);

  const templates = POST_TEMPLATES[platform] || POST_TEMPLATES.general;
  const post = expandTemplate(pickRandom(templates), {
    hook,
    body,
    cta,
    topic,
    lesson: generateLesson(topic),
    takeaway1: generateTakeaway(topic, 0),
    takeaway2: generateTakeaway(topic, 1),
    takeaway3: generateTakeaway(topic, 2),
    tip1: generateHack(topic, 0),
    tip2: generateHack(topic, 1),
    tip3: generateHack(topic, 2),
    controversial_take: `${topic} isn't about being the best — it's about being the most consistent.`,
    emoji: '🔥',
    struggle_time: 'months',
    example: `I used to think ${topic} required expensive tools and years of experience. I was wrong.`,
  });

  return `Here's a ${tone}, ${platform}-ready post about ${topic}:\n\n---\n\n${post}\n\n---\n\n` +
    `**Why this works:** The hook creates curiosity, the body delivers value, and the CTA drives engagement. Want me to adjust the tone, shorten it, or rewrite it for a different platform?`;
}

function generateHook(context: BrainContext): string {
  const topic = context.topic || 'your topic';
  const hooks = HOOK_TEMPLATES.map(t => expandTemplate(t, { topic, audience: context.audience || 'your audience' }));
  const selected = hooks.sort(() => Math.random() - 0.5).slice(0, 5);

  return `Here are 5 hook options for ${topic}:\n\n` +
    selected.map((h, i) => `${i + 1}. "${h}"`).join('\n\n') +
    `\n\n**Which one to pick?**\n` +
    `• **#1** works best for how-to/tutorial content.\n` +
    `• **#2** is great for authority-building and storytelling.\n` +
    `• **#3** creates urgency and relatability.\n` +
    `• **#4** is a pattern interrupt — stops the scroll.\n` +
    `• **#5** leverages social proof and curiosity.\n\n` +
    `Want me to write the full post around any of these hooks?`;
}

function generateStrategy(context: BrainContext): string {
  const topic = context.topic || 'your content';
  const platform = context.platform || 'your main platform';

  return `Here's a 7-day content strategy for ${topic} on ${platform}:\n\n` +
    `**Day 1 — Authority Builder**\n` +
    `Share a lesson you learned the hard way about ${topic}. Be vulnerable. Vulnerability builds trust faster than expertise.\n\n` +
    `**Day 2 — Quick Win**\n` +
    `Post a 60-second tip or mini-tutorial. Give people something they can use in 5 minutes.\n\n` +
    `**Day 3 — Community Engagement**\n` +
    `Ask a question about ${topic}. Don't just broadcast — start a conversation. Reply to every comment in the first hour.\n\n` +
    `**Day 4 — Behind the Scenes**\n` +
    `Show your process, your workspace, or a work-in-progress related to ${topic}. Humanize your brand.\n\n` +
    `**Day 5 — Contrarian Take**\n` +
    `Share an unpopular opinion about ${topic}. Back it up with your experience. Controversy drives engagement (if authentic).\n\n` +
    `**Day 6 — Resource Roundup**\n` +
    `List 3–5 tools, books, or accounts you recommend for ${topic}. Tag the creators — they might share it.\n\n` +
    `**Day 7 — Repurpose Your Best Content**\n` +
    `Take your top-performing post from the week and reformat it: carousel, video, thread, or email.\n\n` +
    `**The golden rule:** Post when your audience is online, not when it's convenient. Check your analytics to find your peak times.`;
}

function generateCritique(context: BrainContext): string {
  const text = context.previousMessages
    .filter(m => m.role === 'user')
    .slice(-1)[0]?.content;

  const userText = typeof text === 'string' ? text : '';
  const contentMatch = userText.match(/["""]([^"""]+)["""]/);
  const contentToCritique = contentMatch ? contentMatch[1] : userText.slice(0, 500);

  if (!contentToCritique || contentToCritique.length < 10) {
    return `I'd love to critique your copy! Please paste the text you'd like me to review (you can wrap it in quotes for clarity). I'll check your hook strength, clarity, CTA, and platform fit.`;
  }

  const wordCount = contentToCritique.split(/\s+/).length;
  const hasHook = /^(stop|imagine|what if|did you know|here['\s]?s|the|why|how|if|i spent|nobody|unpopular|3 |5 |10 )/i.test(contentToCritique);
  const hasCTA = /(comment|share|save|let me know|drop a|reply|tell me|what do you think|agree\?|change my mind)/i.test(contentToCritique);
  const hasLineBreaks = contentToCritique.includes('\n');
  const hasEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(contentToCritique);

  let feedback = `**Critique of your copy:**\n\n`;
  feedback += `• **Length:** ${wordCount} words — `;
  feedback += wordCount > 200 ? 'consider trimming for mobile readability.\n' : 'good length for most platforms.\n';

  feedback += `• **Hook:** `;
  feedback += hasHook ? 'Strong opening that creates curiosity.\n' : 'The opening could be punchier. Try starting with a bold claim, a question, or a pattern interrupt.\n';

  feedback += `• **CTA:** `;
  feedback += hasCTA ? 'You have a call-to-action — good.\n' : 'Missing a clear CTA. Tell the reader exactly what to do next.\n';

  feedback += `• **Formatting:** `;
  feedback += hasLineBreaks ? 'White space makes it scannable. Nice.\n' : 'Add line breaks. Walls of text kill engagement on mobile.\n';

  feedback += `• **Visual cues:** `;
  feedback += hasEmoji ? 'Emojis add personality and break up text.\n' : 'Consider adding 1–2 relevant emojis to improve scannability.\n';

  feedback += `\n**Quick rewrite suggestion:**\n\n`;

  const improved = hasHook
    ? contentToCritique
    : `Stop scrolling. ${contentToCritique.charAt(0).toUpperCase() + contentToCritique.slice(1)}`;

  feedback += `"${improved}"\n\n`;
  feedback += `Want me to rewrite this for a specific tone or platform?`;

  return feedback;
}

function generateBrandAdvice(context: BrainContext): string {
  const niche = context.niche || context.topic || 'your space';
  return `Let's define a brand voice that fits ${niche}:\n\n` +
    `**Step 1 — The 4 Dimensions**\n` +
    `• **Tone:** How formal are you? (Casual like a friend, or professional like a consultant?)\n` +
    `• **Vocabulary:** Simple words or industry jargon? The rule: write to a 10th-grade reading level unless your audience is highly technical.\n` +
    `• **Sentence length:** Short and punchy (Twitter-style) or long and flowing (LinkedIn-story style)?\n` +
    `• **Emotion:** Warm and empathetic, or sharp and analytical?\n\n` +
    `**Step 2 — Content Pillars**\n` +
    `Pick 3–5 themes you own. For ${niche}, examples could be:\n` +
    `1. Beginner mistakes and how to avoid them\n` +
    `2. Advanced tactics most people overlook\n` +
    `3. Behind-the-scenes process and mindset\n` +
    `4. Industry news and your hot takes\n` +
    `5. Community wins and user spotlights\n\n` +
    `**Step 3 — The Voice Test**\n` +
    `Read your last 5 posts out loud. Do they sound like the same person? If not, you have a voice consistency gap. Pick one adjective (e.g., "witty," "empathetic," "bold") and rewrite your next 10 posts through that lens.\n\n` +
    `Want me to help you write a "brand voice cheat sheet" you can pin to your desk?`;
}

function generateHashtags(context: BrainContext): string {
  const topic = context.topic || 'your niche';
  const platform = context.platform || 'instagram';

  const nicheTags = [
    `#${topic.replace(/\s+/g, '')}`,
    `#${topic.replace(/\s+/g, '')}tips`,
    `#${topic.replace(/\s+/g, '')}community`,
    `#learn${topic.replace(/\s+/g, '')}`,
    `#${topic.replace(/\s+/g, '')}life`,
  ];

  const broadTags = ['#contentcreator', '#digitalmarketing', '#socialmediatips', '#entrepreneur', '#growth'];
  const platformSpecific = platform === 'instagram'
    ? ['#instagood', '#reels', '#explorepage', '#contentcreation', '#creatorlife']
    : platform === 'tiktok'
    ? ['#fyp', '#foryou', '#tiktoktips', '#viral', '#trending']
    : platform === 'linkedin'
    ? ['#leadership', '#professionaldevelopment', '#thoughtleadership', '#careergrowth', '#business']
    : platform === 'twitter'
    ? ['#thread', '#buildinpublic', '#indiehackers', '#startup', '#tech']
    : ['#contentcreation', '#digitalmarketing', '#socialmedia'];

  const selected = [...nicheTags.slice(0, 3), ...platformSpecific.slice(0, 3), ...broadTags.slice(0, 2)];

  return `Here are hashtag suggestions for ${topic} on ${platform}:\n\n` +
    `**Niche (high intent, lower competition):**\n` +
    nicheTags.slice(0, 5).join(' ') + `\n\n` +
    `**Platform-optimized:**\n` +
    platformSpecific.slice(0, 5).join(' ') + `\n\n` +
    `**Broad reach:**\n` +
    broadTags.slice(0, 3).join(' ') + `\n\n` +
    `**Strategy:**\n` +
    `• ${platform === 'instagram' || platform === 'tiktok' ? 'Use 3–5 hashtags in the caption. Niche tags drive better engagement than broad ones.' : 'Use 1–2 hashtags. On LinkedIn and Twitter, hashtags matter less than keywords in the text itself.'}\n` +
    `• Rotate your tags. Using the exact same 30 hashtags every time can flag your account as repetitive.\n` +
    `• Create a branded hashtag for your community (e.g., #${(context.brandName || 'YourBrand').replace(/\s+/g, '')}Community).\n\n` +
    `Want me to build a full hashtag strategy document?`;
}

function generateExplain(context: BrainContext): string {
  const lower = context.previousMessages.slice(-1)[0]?.content?.toString().toLowerCase() || '';

  for (const [key, explanation] of Object.entries(EXPLANATIONS)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key)) {
      return explanation;
    }
  }

  // Generic explanation for unknown terms
  return `Great question! Here's the simplest way to think about it:\n\n` +
    `In content marketing, almost everything comes down to three metrics:\n` +
    `1. **Reach** — how many people see your content\n` +
    `2. **Engagement** — how many people interact with it (likes, comments, shares, saves)\n` +
    `3. **Conversion** — how many people take the action you want (follow, click, buy, subscribe)\n\n` +
    `The goal isn't to optimize all three at once. Pick one stage of your funnel and focus there.\n` +
    `• If you're new → optimize for **reach** (hooks, hashtags, consistency).\n` +
    `• If you have followers → optimize for **engagement** (questions, community replies, value bombs).\n` +
    `• If you have engagement → optimize for **conversion** (strong CTAs, lead magnets, clear offers).\n\n` +
    `Want me to go deeper on any of these?`;
}

function generateSchedule(context: BrainContext): string {
  const platform = context.platform || 'general';
  const tips = PLATFORM_TIPS[platform] || PLATFORM_TIPS.general;

  return `**Best posting times for ${platform}:**\n\n` +
    tips.map(t => `• ${t}`).join('\n') + `\n\n` +
    `**Universal rules:**\n` +
    `• Post when YOUR audience is online, not when generic guides say. Check your analytics.\n` +
    `• The first 30 minutes after posting are critical. Reply to every comment to boost velocity.\n` +
    `• Consistency > optimal timing. A post at a "bad" time every day beats a "perfect" time once a week.\n\n` +
    `Want me to help you build a weekly content calendar?`;
}

function generatePlatformTips(context: BrainContext): string {
  const platform = context.platform || 'general';
  const tips = PLATFORM_TIPS[platform] || PLATFORM_TIPS.general;

  return `**${platform.charAt(0).toUpperCase() + platform.slice(1)} Tips:**\n\n` +
    tips.map(t => `• ${t}`).join('\n') + `\n\n` +
    `**One thing most creators miss on ${platform}:**\n` +
    `It's not about the algorithm — it's about the *session*. If your content makes people stay on the platform longer (by clicking into the next post, watching a full video, or reading a long thread), the algorithm rewards you. Create content that's so good people don't want to leave.\n\n` +
    `Want platform-specific post templates? Just ask!`;
}

function generateGeneral(context: BrainContext): string {
  const topic = context.topic || 'content creation';

  const responses = [
    `I love the energy behind that! When it comes to ${topic}, the creators who win are the ones who treat consistency as a skill, not a mood. Show up, ship, iterate. What specifically are you trying to create — a post, a strategy, or something else?`,
    `Great question. The short answer: focus on value first, virality second. If your ${topic} content genuinely helps one person, it will eventually help thousands. What platform are you creating for?`,
    `I'm picking up what you're putting down! For ${topic}, my advice is to start with one platform, one format, and one posting schedule. Master that before expanding. What's your current biggest challenge?`,
    `That resonates. Here's my take: ${topic} success is 20% talent and 80% repetition. The people at the top aren't necessarily smarter — they just didn't quit. How can I help you stay consistent?`,
  ];

  return pickRandom(responses);
}

// ─── Public API ────────────────────────────────────────────────────

export async function chatWithBrain(
  messages: AIMessage[],
  brandKit?: { brandName?: string; niche?: string; tone?: string; contentPillars?: string[]; targetAudience?: string } | null
): Promise<BrainResponse> {
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find(m => m.role === 'user');

  const userText = typeof lastUserMessage?.content === 'string'
    ? lastUserMessage.content
    : '';

  const { intent, confidence } = detectIntent(userText);
  const context = extractContext(userText, messages);

  // Enrich context with brand kit
  if (brandKit) {
    context.brandName = brandKit.brandName || context.brandName;
    context.niche = brandKit.niche || context.niche;
    context.tone = brandKit.tone || context.tone;
    context.contentPillars = brandKit.contentPillars || context.contentPillars;
    context.audience = brandKit.targetAudience || context.audience;
  }

  let text: string;
  switch (intent) {
    case 'welcome':
      text = generateWelcome(context);
      break;
    case 'help':
      text = generateHelp();
      break;
    case 'brainstorm':
      text = generateBrainstorm(context);
      break;
    case 'write_post':
      text = generateWritePost(context);
      break;
    case 'hook':
      text = generateHook(context);
      break;
    case 'strategy':
      text = generateStrategy(context);
      break;
    case 'critique':
      text = generateCritique(context);
      break;
    case 'brand_advice':
      text = generateBrandAdvice(context);
      break;
    case 'hashtag_suggest':
      text = generateHashtags(context);
      break;
    case 'explain':
      text = generateExplain(context);
      break;
    case 'schedule':
      text = generateSchedule(context);
      break;
    case 'platform_tips':
      text = generatePlatformTips(context);
      break;
    default:
      text = generateGeneral(context);
  }

  // Suggest follow-up actions based on intent
  const suggestedActions: string[] = [];
  if (intent === 'brainstorm') suggestedActions.push('Draft one of these ideas', 'Suggest 5 more ideas', 'Create a content calendar');
  if (intent === 'write_post') suggestedActions.push('Write a hook for this', 'Suggest hashtags', 'Rewrite for another platform');
  if (intent === 'hook') suggestedActions.push('Write the full post', 'Give me 5 more hooks', 'Critique this hook');
  if (intent === 'critique') suggestedActions.push('Rewrite this for me', 'Make it shorter', 'Adjust the tone');
  if (intent === 'strategy') suggestedActions.push('Brainstorm content ideas', 'Write posts for day 1 and 2', 'Help me define my brand voice');
  if (intent === 'general') suggestedActions.push('Brainstorm ideas', 'Write a post', 'Give me platform tips');

  return {
    text,
    intent,
    confidence,
    suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
  };
}

export function getBrainCapabilities(): string[] {
  return [
    'Brainstorm content ideas without API keys',
    'Write social media posts for any platform',
    'Craft hooks and headlines',
    'Suggest hashtags and posting strategies',
    'Build content strategy and calendars',
    'Critique and improve existing copy',
    'Explain marketing concepts',
    'Give platform-specific tips',
    'Help define brand voice and content pillars',
  ];
}
