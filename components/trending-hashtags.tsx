'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTrendingHashtags } from '@/hooks/use-realtime-hashtags'
import { Activity, Hash, TrendingUp, Wifi, WifiOff } from 'lucide-react'
import { useEffect } from 'react'

interface TrendingHashtagsProps {
  limit?: number
  showDetails?: boolean
  onHashtagClick?: (hashtag: string) => void
}

export function TrendingHashtags({ 
  limit = 5, 
  showDetails = false,
  onHashtagClick 
}: TrendingHashtagsProps) {
  const { 
    trendingHashtags, 
    loading, 
    connectionStatus, 
    lastUpdate, 
    refreshTrending,
    silentRefresh,
    isRealTime 
  } = useTrendingHashtags(limit)

  // Hidden background refresh of hashtag database every 5 minutes
  useEffect(() => {
    const backgroundRefresh = async () => {
      try {
        await fetch('/api/hashtags/refresh', { method: 'GET' });
        // Silent refresh - no user indication
      } catch (error) {
        // Silent failure
      }
    };

    // Initial background refresh after component mounts
    const initialTimer = setTimeout(backgroundRefresh, 2000); // 2 seconds after mount for faster loading

    // Set up 5-minute interval for background refresh
    const refreshInterval = setInterval(backgroundRefresh, 300000); // 5 minutes

    return () => {
      clearTimeout(initialTimer);
      clearInterval(refreshInterval);
    };
  }, []);

  const handleHashtagClick = (tag: string) => {
    if (onHashtagClick) {
      onHashtagClick(tag)
    } else {
      // Default behavior: could navigate to hashtag search page
      // For now, just log or copy to clipboard
      navigator.clipboard?.writeText(`#${tag}`)
    }
  }

  const getTrendingIcon = (score: number) => {
    if (score > 20) return <TrendingUp className="h-4 w-4 text-red-500" />
    if (score > 10) return <TrendingUp className="h-4 w-4 text-orange-500" />
    return <TrendingUp className="h-4 w-4 text-blue-500" />
  }

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'social_impact': 'bg-green-100 text-green-800',
      'technology': 'bg-blue-100 text-blue-800',
      'education': 'bg-purple-100 text-purple-800',
      'business': 'bg-yellow-100 text-yellow-800',
      'general': 'bg-gray-100 text-gray-800'
    }
    return colors[category] || colors['general']
  }

  const getConnectionIcon = () => {
    return null
  }

  // Removed network status indicators to reduce visual clutter

  if (loading && trendingHashtags.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Trending Hashtags
            <div className="ml-auto flex items-center gap-1">
              {getConnectionIcon()}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent style={{ minHeight: '400px' }}>
          <div className="space-y-3">
            {Array.from({ length: limit }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (connectionStatus === 'disconnected' && trendingHashtags.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Trending Hashtags
          </CardTitle>
        </CardHeader>
        <CardContent style={{ minHeight: '400px' }}>
          <div className="text-center py-6">
            <WifiOff className="h-8 w-8 mx-auto text-red-400 mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Unable to connect to real-time updates
            </p>
            <button 
              onClick={refreshTrending}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Try again
            </button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (trendingHashtags.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Trending Hashtags
            <div className="ml-auto flex items-center gap-1">
              {getConnectionIcon()}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent style={{ minHeight: '400px' }}>
          <div className="text-center py-6">
            <Activity className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-muted-foreground">
              No trending hashtags yet
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Be the first to start a trend!
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Hash className="h-5 w-5" />
          Trending Hashtags
          <div className="ml-auto flex items-center gap-2">
            {trendingHashtags.length > 0 && (
              <Badge variant="secondary">
                {trendingHashtags.length}
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent style={{ minHeight: '400px' }}>
        <div className="space-y-3">
          {trendingHashtags.map((hashtag, index) => (
            <div
              key={hashtag.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Ranking number */}
                <div className="flex-shrink-0">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center">
                    {index + 1}
                  </div>
                </div>

                {/* Hashtag info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      #{hashtag.tag}
                    </span>
                    {hashtag.is_trending && getTrendingIcon(hashtag.trending_score)}
                  </div>
                  
                  {showDetails && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {hashtag.daily_mentions} today
                      </span>
                      <span className="text-xs text-gray-300">•</span>
                      <span className="text-xs text-muted-foreground">
                        {hashtag.weekly_mentions} this week
                      </span>
                    </div>
                  )}
                </div>

                {/* Category and mentions */}
                <div className="flex-shrink-0 text-right">
                  {showDetails && hashtag.category !== 'general' && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs mb-1 ${getCategoryColor(hashtag.category)}`}
                    >
                      {hashtag.category}
                    </Badge>
                  )}
                  <div className="text-sm font-semibold text-blue-600">
                    {hashtag.daily_mentions}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    mentions
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Rankings by activity
            </span>
            {lastUpdate && (
              <span>
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default TrendingHashtags