import type { OrchestrationPlan, AgentConfig } from '@/lib/services/multiAgentService';
import type { EvolutionProposal, AgentVersion } from './agentEvolutionService';
import type { PodcastConfig, PodcastEpisode } from './podcastService';
import type { Competitor, CompetitorAnalysis } from './competitorService';
import type { Influencer, InfluencerCampaign } from './influencerService';
import type { ListeningQuery, Mention } from './socialListeningService';
import type { Newsletter } from './newsletterService';

export interface PodcastDB extends PodcastConfig {
  id: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PodcastEpisodeDB extends PodcastEpisode {
  podcast_id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CompetitorDB extends Competitor {
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CompetitorPost {
  id: string;
  competitor_id: string;
  user_id?: string;
  platform: string;
  content?: string;
  url?: string;
  posted_at?: string;
  metrics: Record<string, unknown>;
  created_at?: string;
}

export interface InfluencerDB extends Influencer {
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InfluencerCampaignDB extends InfluencerCampaign {
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ListeningQueryDB extends ListeningQuery {
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MentionDB extends Mention {
  user_id?: string;
  query_id?: string;
  created_at?: string;
}

export interface NewsletterDB {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  plain_text?: string;
  html_content?: string;
  audience?: string;
  platform: string;
  status: string;
  campaign_id?: string;
  scheduled_at?: string;
  sent_at?: string;
  stats: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  settings: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'invited' | 'active' | 'removed';
  invited_at?: string;
  joined_at?: string;
}

export class SupabaseStateStore {
  private client: any = null;
  private adminClient: any = null;

  private async getClient() {
    if (!this.client) {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase/client');
      this.client = getSupabaseBrowserClient();
    }
    if (!this.client) throw new Error('Supabase client not initialized');
    return this.client;
  }

  private async getAdminClient() {
    if (!this.adminClient) {
      const { getSupabaseAdminClient } = await import('@/lib/supabase/server');
      this.adminClient = getSupabaseAdminClient();
    }
    return this.adminClient;
  }

  async initialize(): Promise<void> {
    // Initialization is implicit via lazy getClient()
  }

  // --- Orchestration Plans ---
  async savePlan(plan: OrchestrationPlan): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('orchestration_plans')
      .upsert({
        id: plan.id,
        user_request: plan.userRequest,
        subtasks: plan.subtasks,
        parallel_groups: plan.parallelGroups,
        aggregation_strategy: plan.aggregationStrategy,
        status: plan.status,
        final_output: plan.finalOutput,
        created_at: plan.createdAt,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Supabase Plan Save Error: ${error.message}`);
  }

  async getPlan(id: string): Promise<OrchestrationPlan | null> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('orchestration_plans')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return {
      id: data.id,
      userRequest: data.user_request,
      subtasks: data.subtasks,
      parallelGroups: data.parallel_groups,
      aggregationStrategy: data.aggregation_strategy,
      status: data.status,
      finalOutput: data.final_output,
      createdAt: data.created_at,
    };
  }

  async listPlans(userId: string, status?: string): Promise<OrchestrationPlan[]> {
    const client = await this.getClient();
    let query = client.from('orchestration_plans').select('*').eq('user_id', userId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id,
      userRequest: row.user_request,
      subtasks: row.subtasks,
      parallelGroups: row.parallel_groups,
      aggregationStrategy: row.aggregation_strategy,
      status: row.status,
      finalOutput: row.final_output,
      createdAt: row.created_at,
    }));
  }

  // --- Agents ---
  async saveAgent(agent: AgentConfig, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('agents')
      .upsert({
        id: agent.id,
        user_id: userId,
        name: agent.name,
        role: agent.role,
        capabilities: agent.capabilities,
        prompt_template: agent.promptTemplate,
        scoring_weights: agent.scoringWeights,
        performance_score: agent.performanceScore,
        task_history: agent.taskHistory,
        evolution_state: agent.evolutionState,
        version: agent.version,
        parent_agents: agent.parentAgents,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
      });
    if (error) throw new Error(`Supabase Agent Save Error: ${error.message}`);
  }

  async getAgent(id: string): Promise<AgentConfig | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('agents').select('*').eq('id', id).single();
    if (error || !data) return null;
    return this.mapAgentRow(data);
  }

  async listAgents(userId: string): Promise<AgentConfig[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('agents')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) return [];
    return (data || []).map((row: any) => this.mapAgentRow(row));
  }

  async deleteAgent(id: string, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('agents').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(`Supabase Agent Delete Error: ${error.message}`);
  }

  private mapAgentRow(row: any): AgentConfig {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      capabilities: row.capabilities || [],
      promptTemplate: row.prompt_template,
      scoringWeights: row.scoring_weights,
      performanceScore: row.performance_score,
      taskHistory: row.task_history || [],
      evolutionState: row.evolution_state,
      version: row.version,
      parentAgents: row.parent_agents,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // --- Agent Evolution ---
  async saveEvolutionProposal(proposal: EvolutionProposal): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('evolution_proposals')
      .upsert({
        id: proposal.id,
        agent_id: proposal.agentId,
        proposal_type: proposal.proposalType,
        current_value: proposal.currentValue,
        proposed_value: proposal.proposedValue,
        reasoning: proposal.reasoning,
        expected_improvement: proposal.expectedImprovement,
        status: proposal.status,
        test_results: proposal.testResults,
        created_at: proposal.createdAt,
        resolved_at: proposal.resolvedAt,
      });
    if (error) throw new Error(`Supabase Evolution Save Error: ${error.message}`);
  }

  async loadEvolutionProposals(): Promise<EvolutionProposal[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('evolution_proposals')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      proposalType: row.proposal_type,
      currentValue: row.current_value,
      proposedValue: row.proposed_value,
      reasoning: row.reasoning,
      expectedImprovement: row.expected_improvement,
      status: row.status,
      testResults: row.test_results,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    }));
  }

  async saveAgentVersion(version: AgentVersion): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('agent_versions')
      .insert({
        version: version.version,
        agent_id: version.agentId,
        prompt_template: version.promptTemplate,
        scoring_weights: version.scoringWeights,
        performance_score: version.performanceScore,
        applied_at: version.appliedAt,
        changed_by: version.changedBy,
      });
    if (error) throw new Error(`Supabase Version Save Error: ${error.message}`);
  }

  async loadAgentVersions(agentId: string): Promise<AgentVersion[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('version', { ascending: false })
      .limit(20);
    if (error) return [];
    return (data || []).map((row: any) => ({
      version: row.version,
      agentId: row.agent_id,
      promptTemplate: row.prompt_template,
      scoringWeights: row.scoring_weights,
      performanceScore: row.performance_score,
      appliedAt: row.applied_at,
      changedBy: row.changed_by,
    }));
  }

  // --- Podcasts ---
  async savePodcast(podcast: PodcastDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('podcasts').upsert({
      id: podcast.id,
      user_id: userId,
      title: podcast.title,
      description: podcast.description,
      author: podcast.author,
      language: podcast.language,
      explicit: podcast.explicit,
      category: podcast.category,
      image_url: podcast.imageUrl,
    });
    if (error) throw new Error(`Supabase Podcast Save Error: ${error.message}`);
  }

  async listPodcasts(userId: string): Promise<PodcastDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('podcasts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async getPodcast(id: string): Promise<PodcastDB | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('podcasts').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  }

  async deletePodcast(id: string, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('podcasts').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(`Supabase Podcast Delete Error: ${error.message}`);
  }

  // --- Podcast Episodes ---
  async savePodcastEpisode(episode: PodcastEpisodeDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('podcast_episodes').upsert({
      id: episode.id,
      podcast_id: episode.podcast_id,
      user_id: userId,
      title: episode.title,
      description: episode.description,
      content: episode.content,
      voices: episode.voices,
      duration: episode.duration,
      audio_url: episode.audioUrl,
      status: episode.status,
      published_at: episode.publishedAt,
    });
    if (error) throw new Error(`Supabase Episode Save Error: ${error.message}`);
  }

  async listPodcastEpisodes(podcastId: string): Promise<PodcastEpisodeDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('podcast_episodes')
      .select('*')
      .eq('podcast_id', podcastId)
      .order('published_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async getPodcastEpisode(id: string): Promise<PodcastEpisodeDB | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('podcast_episodes').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  }

  // --- Competitors ---
  async saveCompetitor(competitor: CompetitorDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('competitors').upsert({
      id: competitor.id,
      user_id: userId,
      name: competitor.name,
      handles: competitor.handles,
      website: competitor.website,
      description: competitor.description,
      last_analyzed: competitor.lastAnalyzed,
    });
    if (error) throw new Error(`Supabase Competitor Save Error: ${error.message}`);
  }

  async listCompetitors(userId: string): Promise<CompetitorDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('competitors')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async getCompetitor(id: string): Promise<CompetitorDB | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('competitors').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  }

  async deleteCompetitor(id: string, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('competitors').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(`Supabase Competitor Delete Error: ${error.message}`);
  }

  async saveCompetitorAnalysis(analysis: CompetitorAnalysis, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('competitor_analyses').insert({
      competitor_id: analysis.competitorId,
      user_id: userId,
      platform: analysis.platform,
      analyzed_at: analysis.analyzedAt,
      metrics: analysis.metrics,
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      opportunities: analysis.opportunities,
      content_strategy: analysis.contentStrategy,
    });
    if (error) throw new Error(`Supabase Competitor Analysis Save Error: ${error.message}`);
  }

  async listCompetitorAnalyses(competitorId: string): Promise<CompetitorAnalysis[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('competitor_analyses')
      .select('*')
      .eq('competitor_id', competitorId)
      .order('analyzed_at', { ascending: false });
    if (error) return [];
    return (data || []).map((row: any) => ({
      competitorId: row.competitor_id,
      platform: row.platform,
      analyzedAt: row.analyzed_at,
      metrics: row.metrics,
      strengths: row.strengths || [],
      weaknesses: row.weaknesses || [],
      opportunities: row.opportunities || [],
      contentStrategy: row.content_strategy,
    }));
  }

  async saveCompetitorPost(post: CompetitorPost, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('competitor_posts').insert({
      competitor_id: post.competitor_id,
      user_id: userId,
      platform: post.platform,
      content: post.content,
      url: post.url,
      posted_at: post.posted_at,
      metrics: post.metrics,
    });
    if (error) throw new Error(`Supabase Competitor Post Save Error: ${error.message}`);
  }

  async listCompetitorPosts(competitorId: string, limit = 50): Promise<CompetitorPost[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('competitor_posts')
      .select('*')
      .eq('competitor_id', competitorId)
      .order('posted_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  }

  // --- Influencers ---
  async saveInfluencer(influencer: InfluencerDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('influencers').upsert({
      id: influencer.id,
      user_id: userId,
      name: influencer.name,
      platform: influencer.platform,
      handle: influencer.handle,
      followers: influencer.followers,
      engagement_rate: influencer.engagementRate,
      niche: influencer.niche,
      contact_email: influencer.contactEmail,
      status: influencer.status,
      notes: influencer.notes,
      campaigns: influencer.campaigns,
    });
    if (error) throw new Error(`Supabase Influencer Save Error: ${error.message}`);
  }

  async listInfluencers(userId: string): Promise<InfluencerDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('influencers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async getInfluencer(id: string): Promise<InfluencerDB | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('influencers').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  }

  async deleteInfluencer(id: string, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('influencers').delete().eq('id', id).eq('user_id', userId);
    if (error) throw new Error(`Supabase Influencer Delete Error: ${error.message}`);
  }

  // --- Influencer Campaigns ---
  async saveInfluencerCampaign(campaign: InfluencerCampaignDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('influencer_campaigns').upsert({
      id: campaign.id,
      user_id: userId,
      name: campaign.name,
      influencers: campaign.influencers,
      budget: campaign.budget,
      start_date: campaign.startDate,
      end_date: campaign.endDate,
      status: campaign.status,
      deliverables: campaign.deliverables,
      metrics: campaign.metrics,
    });
    if (error) throw new Error(`Supabase Influencer Campaign Save Error: ${error.message}`);
  }

  async listInfluencerCampaigns(userId: string): Promise<InfluencerCampaignDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('influencer_campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  // --- Social Listening ---
  async saveListeningQuery(query: ListeningQueryDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('listening_queries').upsert({
      id: query.id,
      user_id: userId,
      query: query.query,
      platforms: query.platforms,
      sentiment_filter: query.sentiment,
      is_active: query.isActive,
      mention_count: query.mentionCount,
      last_checked: query.lastChecked,
    });
    if (error) throw new Error(`Supabase Listening Query Save Error: ${error.message}`);
  }

  async listListeningQueries(userId: string): Promise<ListeningQueryDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('listening_queries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map((row: any) => ({
      id: row.id,
      query: row.query,
      platforms: row.platforms || [],
      sentiment: row.sentiment_filter,
      isActive: row.is_active,
      mentionCount: row.mention_count,
      lastChecked: row.last_checked,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async saveMention(mention: MentionDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('social_mentions').upsert({
      id: mention.id,
      user_id: userId,
      query_id: mention.query_id,
      platform: mention.platform,
      author: mention.author,
      content: mention.content,
      url: mention.url,
      sentiment: mention.sentiment,
      engagement: mention.engagement,
      keywords: mention.keywords,
    });
    if (error) throw new Error(`Supabase Mention Save Error: ${error.message}`);
  }

  async listMentions(queryId: string, limit = 100): Promise<MentionDB[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('social_mentions')
      .select('*')
      .eq('query_id', queryId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data || [];
  }

  // --- Newsletters ---
  async saveNewsletter(newsletter: NewsletterDB, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('newsletters').upsert({
      id: newsletter.id,
      user_id: userId,
      title: newsletter.title,
      content: newsletter.content,
      plain_text: newsletter.plain_text,
      html_content: newsletter.html_content,
      audience: newsletter.audience,
      platform: newsletter.platform,
      status: newsletter.status,
      campaign_id: newsletter.campaign_id,
      scheduled_at: newsletter.scheduled_at,
      sent_at: newsletter.sent_at,
      stats: newsletter.stats,
    });
    if (error) throw new Error(`Supabase Newsletter Save Error: ${error.message}`);
  }

  async listNewsletters(userId: string, platform?: string): Promise<NewsletterDB[]> {
    const client = await this.getClient();
    let query = client.from('newsletters').select('*').eq('user_id', userId);
    if (platform) query = query.eq('platform', platform);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async getNewsletter(id: string): Promise<NewsletterDB | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('newsletters').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  }

  async updateNewsletterStats(id: string, stats: Record<string, unknown>): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('newsletters')
      .update({ stats, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Supabase Newsletter Stats Update Error: ${error.message}`);
  }

  // --- Teams ---
  async createTeam(team: Omit<Team, 'id'>): Promise<Team> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('teams')
      .insert({
        name: team.name,
        description: team.description,
        owner_id: team.owner_id,
        settings: team.settings,
      })
      .select()
      .single();
    if (error) throw new Error(`Supabase Team Create Error: ${error.message}`);
    return data;
  }

  async getTeam(id: string): Promise<Team | null> {
    const client = await this.getClient();
    const { data, error } = await client.from('teams').select('*').eq('id', id).single();
    if (error || !data) return null;
    return data;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('teams')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Supabase Team Update Error: ${error.message}`);
  }

  async deleteTeam(id: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client.from('teams').delete().eq('id', id);
    if (error) throw new Error(`Supabase Team Delete Error: ${error.message}`);
  }

  async getUserTeams(userId: string): Promise<Team[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('teams')
      .select('*')
      .or(`owner_id.eq.${userId},id.in.(select team_id from team_members where user_id=${userId} and status='active')`)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async inviteMember(teamId: string, email: string, role: TeamMember['role'], inviterId: string): Promise<TeamMember> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('team_members')
      .insert({
        team_id: teamId,
        email,
        role,
        status: 'invited',
        invited_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(`Supabase Invite Error: ${error.message}`);
    return data;
  }

  async acceptMemberInvite(memberId: string, userId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('team_members')
      .update({ status: 'active', user_id: userId, joined_at: new Date().toISOString() })
      .eq('id', memberId);
    if (error) throw new Error(`Supabase Accept Invite Error: ${error.message}`);
  }

  async removeMember(teamId: string, memberId: string): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', teamId);
    if (error) throw new Error(`Supabase Remove Member Error: ${error.message}`);
  }

  async updateMemberRole(teamId: string, memberId: string, newRole: TeamMember['role']): Promise<void> {
    const client = await this.getClient();
    const { error } = await client
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId)
      .eq('team_id', teamId);
    if (error) throw new Error(`Supabase Update Role Error: ${error.message}`);
  }

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const client = await this.getClient();
    const { data, error } = await client
      .from('team_members')
      .select('*')
      .eq('team_id', teamId)
      .order('invited_at', { ascending: false });
    if (error) return [];
    return data || [];
  }
}

export const stateStore = new SupabaseStateStore();
