# 🚀 NexusAI: Master Operations Manual
## The Marketing Intelligence OS

NexusAI has evolved from a generation tool into an autonomous intelligence loop. This manual outlines the high-level "God-mode" workflows now available in the system.

---

## 📹 1. The "Video-to-Campaign" Workflow
**Capability**: Turn any YouTube video or raw audio file into a full-scale multi-platform campaign.

**The Process**:
1. **Ingest**: Provide a YouTube URL or upload an `.mp3`/`.wav`/`.m4a` file in the Repurposing tab.
2. **Transcribe**: NexusAI automatically extracts the spoken-word transcript, stripping verbal tics and filler words.
3. **Distill**: The AI identifies the "Gold Nuggets"—the most impactful quotes and value propositions.
4. **Adapt**: The system generates tailored posts for Twitter, LinkedIn, TikTok, etc., based on the distilled essence.

**Pro Tip**: Use this to turn your long-form podcasts or webinars into a month's worth of social content in seconds.

---

## 🎯 2. The "Competitive Edge" Workflow
**Capability**: Identify strategic gaps in your competitors' messaging and pivot your content to exploit them.

**The Process**:
1. **Audit**: Use the `/api/intel/analyze` endpoint (or the Intel Dashboard) to input a competitor's URL.
2. **Deconstruct**: NexusAI scrapes their landing page and analyzes their value proposition, voice, and perceived weaknesses.
3. **Identify Gaps**: The system outputs "Strategic Gaps"—topics or angles the competitor is ignoring.
4. **Pivot**: When repurposing content, select the "Competitive Overlay" option. NexusAI will now rewrite your hooks to position your brand as the superior solution to the competitor's gaps.

---

## ⚡ 3. The "Autonomous Amplification" Loop
**Capability**: Automatically detect "Viral Momentum" and double down on winning content.

**The Process**:
1. **Monitor**: The system constantly analyzes the sentiment of your live posts.
2. **Trigger**: If a post hits the **Viral Threshold** (High Excitement + High Volume), the `IntelligenceTriggerService` fires.
3. **Amplify**: NexusAI automatically treats that winning post as "Master Content" and generates an amplification campaign for all other platforms.
4. **Draft**: The campaign is placed in your drafts as a "Momentum Campaign," ready for one-click approval and publishing.

---

## 🤝 4. Multiplayer Collaboration
**Capability**: Real-time, Google-Docs-style co-editing of content strategies.

**The Process**:
1. **Join**: Open a shared draft. You are automatically joined to a Supabase Realtime channel.
2. **Sync**: Every keystroke is broadcast to your team. No more "Save" buttons or version conflicts.
3. **Presence**: See who is online via colored cursors and user indicators.
4. **Persist**: Once the team agrees on the final version, the draft is persisted to the database and moved to the scheduling queue.

---

## 📡 5. Native Publishing Orchestration
**Capability**: Direct-to-community delivery via first-party APIs.

**Supported Native Channels**:
- **Discord**: Direct webhook delivery for instant community updates.
- **Reddit**: Official API submission for niche community reach.
- **WhatsApp**: Meta Graph API for direct-to-customer broadcasting.

**The Logic**: The `PublishOrchestrator` uses a `NATIVE_FIRST` strategy. It attempts to use these direct pipes first for maximum reliability and control, failing over to Ayrshare only if a native credential is missing.

---

## 🛠️ Infrastructure Summary
- **LLM Core**: Cognitive Reasoning Chain (Deconstruct $\rightarrow$ Draft $\rightarrow$ Critique $\rightarrow$ Refine).
- **Security**: AES-GCM 256-bit encryption for all API keys.
- **Persistence**: Supabase (Postgres + Realtime) + Puter.js (KV/FS).
- **Intelligence**: Multi-Agent Swarm with distributed tracing via `SwarmTraceService`.
