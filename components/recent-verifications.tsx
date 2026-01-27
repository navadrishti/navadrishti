'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Building2, Heart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Verification {
  id: number;
  name: string;
  profile_image?: string;
  type: 'NGO' | 'Company';
  created_at: string;
}

export function RecentVerifications() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVerifications();
  }, []);

  const fetchVerifications = async () => {
    try {
      const response = await fetch('/api/recent-verifications');
      const data = await response.json();
      if (data.success) {
        setVerifications(data.verifications);
      }
    } catch (err) {
      console.error('Error fetching verifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    const names = name.trim().split(' ').filter(n => n.length > 0);
    if (names.length === 0) return "U";
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    return names[0].charAt(0).toUpperCase() + names[names.length - 1].charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="p-[2px] rounded-lg bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-600">
      <Card className="border-0 bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-black">
            Recent Verifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 pb-3 border-b last:border-0">
                <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>
    );
  }

  return (
    <div className="p-[2px] rounded-lg bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-600">
    <Card className="border-0 bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-black">
          Recent Verifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {verifications.length === 0 ? (
            <p className="text-sm text-gray-500">No recent verifications</p>
          ) : (
            verifications.map((verification) => (
              <div key={verification.id} className="flex items-center gap-3 pb-3 border-b last:border-0 last:pb-0">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={verification.profile_image} alt={verification.name} />
                  <AvatarFallback className="bg-gradient-to-br from-green-500 to-teal-600 text-white">
                    {getInitials(verification.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-black truncate">
                      {verification.name}
                    </p>
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {verification.type === 'NGO' ? (
                        <><Heart className="w-3 h-3 mr-1" /> NGO</>
                      ) : (
                        <><Building2 className="w-3 h-3 mr-1" /> Company</>
                      )}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(verification.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
