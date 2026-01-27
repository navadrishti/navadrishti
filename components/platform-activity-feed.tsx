'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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

  const getActivityBadgeColor = (type: string) => {
    switch (type) {
      case 'listing':
        return 'bg-blue-100 text-blue-800';
      case 'service_request':
        return 'bg-purple-100 text-purple-800';
      case 'service_offer':
        return 'bg-teal-100 text-teal-800';
      case 'user_joined':
        return 'bg-green-100 text-green-800';
      case 'order':
        return 'bg-emerald-100 text-emerald-800';
      case 'post':
        return 'bg-indigo-100 text-indigo-800';
      case 'announcement':
        return 'bg-orange-100 text-orange-800';
      case 'changelog':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getActivityTypeLabel = (type: string) => {
    switch (type) {
      case 'listing':
        return 'New Listing';
      case 'service_request':
        return 'Service Request';
      case 'service_offer':
        return 'Service Offer';
      case 'user_joined':
        return 'New Member';
      case 'order':
        return 'Order Completed';
      case 'post':
        return 'New Post';
      case 'announcement':
        return 'Announcement';
      case 'changelog':
        return 'Platform Update';
      default:
        return 'Activity';
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
        <Card key={activity.id} className="hover:shadow-sm transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {/* Activity Icon */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  {getActivityIcon(activity.type)}
                </div>
              </div>

              {/* Activity Content - Concise */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className={`${getActivityBadgeColor(activity.type)} text-xs`}>
                    {getActivityTypeLabel(activity.type)}
                  </Badge>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                  </span>
                </div>

                {/* User Info with Action */}
                {activity.user ? (
                  <div className="flex items-center gap-2">
                    <Link href={`/profile/${activity.user.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <Avatar className="w-6 h-6">
                        {activity.user.profile_image && (
                          <AvatarImage src={activity.user.profile_image} />
                        )}
                        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-500 text-white text-xs">
                          {getInitials(activity.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-gray-900">{activity.user.name}</span>
                      {activity.user.verification_status === 'verified' && (
                        <VerificationBadge status="verified" size="sm" showText={false} />
                      )}
                    </Link>
                    {activity.link ? (
                      <Link href={activity.link} className="text-sm text-gray-700 hover:text-blue-600 transition-colors flex-1 truncate">
                        {activity.title}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-700 flex-1 truncate">{activity.title}</span>
                    )}
                  </div>
                ) : (
                  // For announcements/changelogs without user
                  activity.link ? (
                    <Link href={activity.link} className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors">
                      {activity.title}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                  )
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
