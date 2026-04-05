'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { VerificationBadge } from './verification-badge';
import { 
  Package, 
  HandHeart, 
  UserPlus, 
  ShoppingBag, 
  Heart,
  MessageSquare,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Info,
  Megaphone,
  Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Activity {
  id: string;
  type: 'listing' | 'service_request' | 'service_offer' | 'user_joined' | 'order' | 'post' | 'announcement' | 'changelog';
  title: string;
  description?: string;
  user?: {
    id: number;
    name: string;
    profile_image?: string;
    user_type: string;
    verification_status?: string;
  };
  timestamp: string;
  metadata?: any;
  link?: string;
}

export function PlatformActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getInitials = (name: string) => {
    if (!name) return "U";
    const names = name.trim().split(' ').filter(n => n.length > 0);
    if (names.length === 0) return "U";
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return names[0].charAt(0).toUpperCase() + names[names.length - 1].charAt(0).toUpperCase();
  };

  useEffect(() => {
    fetchActivities();
    // Refresh every 60 seconds instead of 30
    const interval = setInterval(fetchActivities, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchActivities = async () => {
    try {
      setError(null);
      const response = await fetch('/api/platform-activities');
      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }
      const data = await response.json();
      if (data.success) {
        setActivities(data.activities);
      } else {
        setError(data.error || 'Failed to load activities');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'listing':
        return <ShoppingBag className="w-5 h-5 text-blue-600" />;
      case 'service_request':
        return <HandHeart className="w-5 h-5 text-purple-600" />;
      case 'service_offer':
        return <Package className="w-5 h-5 text-teal-600" />;
      case 'user_joined':
        return <UserPlus className="w-5 h-5 text-green-600" />;
      case 'order':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'post':
        return <MessageSquare className="w-5 h-5 text-indigo-600" />;
      case 'announcement':
        return <Megaphone className="w-5 h-5 text-orange-600" />;
      case 'changelog':
        return <Sparkles className="w-5 h-5 text-pink-600" />;
      default:
        return <Info className="w-5 h-5 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">Failed to load activities</p>
              <p className="text-sm text-red-500">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <TrendingUp className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">No recent activities</p>
          <p className="text-sm text-gray-500 mt-2">Check back later for platform updates</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <Card key={activity.id} className="border-2 border-slate-200 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center gap-3 justify-between">
              {/* Activity Content */}
              <div className="flex-1 min-w-0">
                {activity.user ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/profile/${activity.user.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <Avatar className="w-8 h-8">
                        {activity.user.profile_image && (
                          <AvatarImage src={activity.user.profile_image} />
                        )}
                        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-sm">
                          {getInitials(activity.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-semibold text-slate-900">{activity.user.name}</span>
                      {activity.user.verification_status === 'verified' && (
                        <VerificationBadge status="verified" size="sm" showText={false} />
                      )}
                    </Link>
                    {activity.link ? (
                      <Link href={activity.link} className="text-sm text-slate-700 hover:text-blue-700 transition-colors truncate">
                        {activity.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-700 truncate">{activity.title}</span>
                    )}
                  </div>
                ) : (
                  activity.link ? (
                    <Link href={activity.link} className="text-sm font-semibold text-slate-900 hover:text-blue-700 transition-colors">
                      {activity.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-slate-900">{activity.title}</p>
                  )
                )}
              </div>

              <span className="text-xs text-slate-500 shrink-0 ml-3 whitespace-nowrap">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
