'use client';

import { useState, useEffect, useCallback } from 'react';

export interface HashtagData {
  id: number;
  tag: string;
  total_mentions: number;
  daily_mentions: number;
  weekly_mentions: number;
  trending_score: number;
  category: string;
  is_trending: boolean;
  created_at: string;
  updated_at: string;
}

interface UseTrendingHashtagsReturn {
  hashtags: HashtagData[];
  trendingHashtags: HashtagData[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  lastUpdate: Date | null;
  refreshTrending: () => Promise<void>;
  isRealTime: boolean;
  refetch: () => Promise<void>;
}

export function useTrendingHashtags(limit: number = 5): UseTrendingHashtagsReturn {
  const [hashtags, setHashtags] = useState<HashtagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false); // Start as disconnected
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchTrendingHashtags = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Immediate fetch for faster loading
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for faster responses
      
      const response = await fetch(`/api/hashtags/trending?limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error: ${response.status} - ${errorText}`);
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        setHashtags(result.data);
        setIsConnected(true);
        setLastUpdate(new Date());
        setRetryCount(0); // Reset retry count on success
      } else {
        const errorMsg = result.error || 'Invalid response format';
        console.error('API returned unsuccessful result:', errorMsg);
        setError(errorMsg);
        setIsConnected(false);
        // Don't clear hashtags if we have existing data
        if (hashtags.length === 0) {
          setHashtags([]);
        }
      }
    } catch (err: any) {
      console.error('Error in fetchTrendingHashtags:', err);
      
      let errorMessage = 'Failed to fetch trending hashtags';
      
      if (err.name === 'AbortError') {
        errorMessage = 'Request timeout - server may be starting up';
      } else if (err.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - check connection';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setIsConnected(false);
      setRetryCount(prev => prev + 1);
      
      // Don't clear existing hashtags if we have them
      if (hashtags.length === 0) {
        setHashtags([]);
      }
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Initial fetch - immediate for faster loading
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTrendingHashtags();
    }, 100); // Minimal delay to ensure component is mounted
    
    return () => clearTimeout(timer);
  }, [fetchTrendingHashtags]);

  // Set up hidden auto-refresh every 5 minutes
  useEffect(() => {
    // Always set up the 5-minute refresh regardless of connection status
    const autoRefreshInterval = setInterval(() => {
      // Silent refresh - don't show loading state
      const currentLoading = loading;
      fetchTrendingHashtags().then(() => {
        // Silently updated in background
      });
    }, 300000); // 5 minutes = 300,000ms

    // Set up retry logic for failed connections
    let retryTimer: NodeJS.Timeout | null = null;
    if (!isConnected && error) {
      retryTimer = setTimeout(() => {
        fetchTrendingHashtags();
      }, 60000); // Retry after 1 minute
    }

    return () => {
      clearInterval(autoRefreshInterval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [fetchTrendingHashtags, isConnected, error]);

  // Removed visibility change handler to prevent excessive fetching

  // Hidden refresh function for silent background updates
  const silentRefresh = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // Shorter timeout for silent refresh
      
      const response = await fetch(`/api/hashtags/trending?limit=${limit}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setHashtags(result.data);
          setIsConnected(true);
          setLastUpdate(new Date());
          setError(null);
        }
      }
    } catch (err) {
      // Silent failure for background refresh
      console.log('Silent refresh failed, will retry in 5 minutes');
    }
  }, [limit]);

  return {
    hashtags,
    trendingHashtags: hashtags,
    loading,
    error,
    isConnected,
    connectionStatus: isConnected ? (loading ? 'connecting' : 'connected') : 'disconnected',
    lastUpdate,
    refreshTrending: async () => {
      setLoading(true);
      await fetchTrendingHashtags();
    },
    silentRefresh,
    isRealTime: true,
    refetch: async () => {
      setError(null);
      setIsConnected(true);
      await fetchTrendingHashtags();
    },
  };
}

// Additional hook for hashtag statistics
export function useHashtagStats() {
  const [stats, setStats] = useState({
    total_hashtags: 0,
    trending_count: 0,
    total_mentions: 0,
    daily_mentions: 0,
    weekly_mentions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/hashtags/maintenance', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch hashtag stats: ${response.status}`);
      }

      const result = await response.json();

      if (result.success && result.data?.statistics) {
        setStats(result.data.statistics);
      } else {
        setError(result.error || 'Failed to fetch hashtag statistics');
      }
    } catch (err: any) {
      console.error('Error fetching hashtag stats:', err);
      setError(err.message || 'Failed to fetch hashtag statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}