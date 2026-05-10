// app/(app)/discovery/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { Search, TrendingUp, MapPin, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface TrendItem {
  title: string;
  text: string;
  url: string;
  source: string;
  category: string;
  country?: string;
}

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export default function DiscoveryPage() {
  const [query, setQuery] = useState('AI Agents');
  const [isLoading, setIsLoading] = useState(false);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [location, setLocation] = useState<any>(null);

  const fetchDiscoveryData = async () => {
    setIsLoading(true);
    try {
      const [trendsRes, searchRes, locRes] = await Promise.all([
        fetch(`/api/discovery/trends?query=${encodeURIComponent(query)}`).then(res => res.json()),
        fetch(`/api/discovery/trends?query=${encodeURIComponent(query)}`).then(res => res.json()), // reuse trends endpoint
        fetch(`/api/discovery/location`).then(res => res.json()),
      ]);

      setTrends(trendsRes.trends || []);
      setSearchResults(searchRes.search || []);
      setLocation(locRes);
      toast.success('Discovery data updated');
    } catch (error) {
      toast.error('Failed to fetch discovery data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscoveryData();
  }, []);

  return (
    <div className="min-h-screen bg-[#080B14] p-4 md:p-8 space-y-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-cyan-400" />
              Nexus Discovery
            </h1>
            <p className="text-gray-400">Real-time trends and global content sourcing</p>
          </div>
          
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchDiscoveryData()}
                className="pl-10 pr-4 py-2 bg-black/40 border border-gray-700 rounded-lg text-white outline-none focus:border-cyan-500/50"
                placeholder="Search trends..."
              />
            </div>
            <NeonButton 
              onClick={fetchDiscoveryData} 
              loading={isLoading}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </NeonButton>
          </div>
        </div>

        {location && (
          <GlassCard className="p-4 mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-cyan-400" />
              <div>
                <span className="text-gray-400 text-sm">Current Target Region: </span>
                <span className="text-white font-medium">{location.city}, {location.country_name}</span>
              </div>
            </div>
            <span className="text-xs text-gray-500">Auto-detected via IPStack</span>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* News Trends */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-cyan-400" />
              Trending News
            </h2>
            {isLoading ? (
              <LoadingPulse />
            ) : trends.length === 0 ? (
              <GlassCard className="p-8 text-center text-gray-500">No trending news found for "{query}"</GlassCard>
            ) : (
              <div className="space-y-4">
                {trends.map((item, i) => (
                  <GlassCard key={i} className="p-4 hover:border-cyan-500/30 transition-colors group">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-xs font-bold text-cyan-400 uppercase">{item.category}</span>
                        <h3 className="text-white font-semibold mt-1 group-hover:text-cyan-300 transition-colors">{item.title}</h3>
                        <p className="text-gray-400 text-sm mt-2 line-clamp-2">{item.text}</p>
                        <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                          <span className="font-medium text-gray-300">{item.source}</span>
                          <span>•</span>
                          <span>{item.country}</span>
                        </div>
                      </div>
                      <a href={item.url} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                      </a>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>

          {/* Search Validation */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Search className="h-6 w-6 text-violet-400" />
              Web Validation
            </h2>
            {isLoading ? (
              <LoadingPulse />
            ) : searchResults.length === 0 ? (
              <GlassCard className="p-8 text-center text-gray-500">No search results found for "{query}"</GlassCard>
            ) : (
              <div className="space-y-4">
                {searchResults.map((result, i) => (
                  <GlassCard key={i} className="p-4 hover:border-violet-500/30 transition-colors group">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="text-white font-semibold group-hover:text-violet-300 transition-colors">{result.title}</h3>
                        <p className="text-gray-400 text-sm mt-2 line-clamp-2">{result.snippet}</p>
                        <div className="mt-2">
                          <a href={result.link} target="_blank" rel="noreferrer" className="text-xs text-violet-400 hover:underline truncate block max-w-xs">
                            {result.link}
                          </a>
                        </div>
                      </div>
                      <a href={result.link} target="_blank" rel="noreferrer" className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                        <ExternalLink className="h-4 w-4 text-gray-400" />
                      </a>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
