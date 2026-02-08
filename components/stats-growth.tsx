'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, Package, ShoppingCart } from 'lucide-react';

interface StatsGrowth {
  newPosts: number;
  newUsers: number;
  newListings: number;
  newOrders: number;
  period: string;
}

export function StatsGrowth() {
  const [growth, setGrowth] = useState<StatsGrowth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGrowth();
  }, []);

  const fetchGrowth = async () => {
    try {
      const response = await fetch('/api/stats-growth');
      const data = await response.json();
      if (data.success) {
        setGrowth(data.growth);
      }
    } catch (err) {
      console.error('Error fetching growth:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !growth) {
    return (
      <Card className="border-2 border-gray-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-black">
            Growth (7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-gray-200 bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-black">
          Growth ({growth.period})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {growth.newUsers === 0 && growth.newListings === 0 && growth.newOrders === 0 && growth.newPosts === 0 ? (
          <p className="text-sm text-gray-500 text-left py-4">No recent activity in the last 7 days</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-black">New Posts</span>
              </div>
              <span className="text-lg font-bold text-black">+{growth.newPosts}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-black">New Users</span>
              </div>
              <span className="text-lg font-bold text-black">+{growth.newUsers}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-black">New Listings</span>
              </div>
              <span className="text-lg font-bold text-black">+{growth.newListings}</span>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-black">New Orders</span>
              </div>
              <span className="text-lg font-bold text-black">+{growth.newOrders}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
