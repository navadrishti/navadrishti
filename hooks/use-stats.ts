import { useState, useEffect } from 'react';

interface Stats {
  activeUsers: number;
  partnerNGOs: number;
  partnerCompanies: number;
  successStories: number;
  totalUsers: number;
  activeIndividuals: number;
  activeServiceOffers: number;
  totalVolunteers: number;
  recentActivity: number;
  communitiesServed: number;
}

export function useStats() {
  const [stats, setStats] = useState<Stats>({
    activeUsers: 0,
    partnerNGOs: 0,
    partnerCompanies: 0,
    successStories: 0,
    totalUsers: 0,
    activeIndividuals: 0,
    activeServiceOffers: 0,
    totalVolunteers: 0,
    recentActivity: 0,
    communitiesServed: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        
        // Add timeout to prevent long loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch('/api/stats', {
          signal: controller.signal,
          cache: 'force-cache' // Use cache when available
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.stats) {
          // Ensure all stats are valid numbers
          const validStats = {
            activeUsers: Number(data.stats.activeUsers) || 0,
            partnerNGOs: Number(data.stats.partnerNGOs) || 0,
            partnerCompanies: Number(data.stats.partnerCompanies) || 0,
            successStories: Number(data.stats.successStories) || 0,
            totalUsers: Number(data.stats.totalUsers) || 0,
            activeIndividuals: Number(data.stats.activeIndividuals) || 0,
            activeServiceOffers: Number(data.stats.activeServiceOffers) || 0,
            totalVolunteers: Number(data.stats.totalVolunteers) || 0,
            recentActivity: Number(data.stats.recentActivity) || 0,
            communitiesServed: Number(data.stats.communitiesServed) || 0
          };
          setStats(validStats);
          setError(null);
        } else {
          setError(data.error || 'Failed to fetch statistics');
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setError('Stats loading timed out');
        } else {
          setError('Failed to fetch statistics');
        }
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return { stats, loading, error };
}