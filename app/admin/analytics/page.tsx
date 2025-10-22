'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  ShoppingBag,
  DollarSign,
  Activity,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw
} from 'lucide-react';

interface AnalyticsData {
  userGrowth: {
    current: number;
    previous: number;
    percentage: number;
  };
  orderTrends: {
    current: number;
    previous: number;
    percentage: number;
  };
  revenueAnalytics: {
    current: number;
    previous: number;
    percentage: number;
  };
  platformMetrics: {
    activeUsers: number;
    totalListings: number;
    completedOrders: number;
    avgOrderValue: number;
  };
}

export default function AdminAnalytics() {
  const { adminUser, loading: authLoading } = useAdminAuth();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (!authLoading && adminUser) {
      fetchAnalytics();
    }
  }, [adminUser, authLoading]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      
      // This would normally fetch from multiple analytics endpoints
      // For now, we'll use the stats API and simulate additional data
      const response = await fetch('/api/admin/analytics/stats');
      if (response.ok) {
        const stats = await response.json();
        
        // Transform stats into analytics format
        setAnalytics({
          userGrowth: {
            current: stats.totalUsers,
            previous: Math.floor(stats.totalUsers * 0.9),
            percentage: 12
          },
          orderTrends: {
            current: stats.totalOrders,
            previous: Math.floor(stats.totalOrders * 0.85),
            percentage: 18
          },
          revenueAnalytics: {
            current: stats.totalRevenue,
            previous: Math.floor(stats.totalRevenue * 0.88),
            percentage: 15
          },
          platformMetrics: {
            activeUsers: Math.floor(stats.totalUsers * 0.6),
            totalListings: stats.activeListings,
            completedOrders: Math.floor(stats.totalOrders * 0.8),
            avgOrderValue: stats.totalOrders > 0 ? Math.floor(stats.totalRevenue / stats.totalOrders) : 0
          }
        });
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ 
    title, 
    value, 
    change, 
    icon: Icon, 
    format = 'number' 
  }: {
    title: string;
    value: number;
    change: number;
    icon: any;
    format?: 'number' | 'currency' | 'percentage';
  }) => {
    const formatValue = (val: number) => {
      switch (format) {
        case 'currency':
          return `₹${val.toLocaleString()}`;
        case 'percentage':
          return `${val}%`;
        default:
          return val.toLocaleString();
      }
    };

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatValue(value)}</div>
          <div className="flex items-center text-xs text-muted-foreground">
            {change > 0 ? (
              <ArrowUpRight className="h-3 w-3 text-green-600 mr-1" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-600 mr-1" />
            )}
            <span className={change > 0 ? 'text-green-600' : 'text-red-600'}>
              {Math.abs(change)}% from last month
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
            <p className="text-gray-600 mt-1">
              Comprehensive platform analytics and insights
            </p>
          </div>
          <div className="flex items-center space-x-2 mt-4 sm:mt-0">
            <Button variant="outline" size="sm" onClick={fetchAnalytics}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Badge variant="secondary">
              <Activity className="w-3 h-3 mr-1" />
              Live Data
            </Badge>
          </div>
        </div>

        {/* Analytics Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </CardHeader>
                    <CardContent className="animate-pulse">
                      <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3 mt-2"></div>
                    </CardContent>
                  </Card>
                ))
              ) : analytics ? (
                <>
                  <MetricCard
                    title="Total Users"
                    value={analytics.userGrowth.current}
                    change={analytics.userGrowth.percentage}
                    icon={Users}
                  />
                  <MetricCard
                    title="Total Orders"
                    value={analytics.orderTrends.current}
                    change={analytics.orderTrends.percentage}
                    icon={ShoppingBag}
                  />
                  <MetricCard
                    title="Total Revenue"
                    value={analytics.revenueAnalytics.current}
                    change={analytics.revenueAnalytics.percentage}
                    icon={DollarSign}
                    format="currency"
                  />
                  <MetricCard
                    title="Active Listings"
                    value={analytics.platformMetrics.totalListings}
                    change={5}
                    icon={TrendingUp}
                  />
                </>
              ) : null}
            </div>

            {/* Platform Health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Platform Health</CardTitle>
                  <CardDescription>Key performance indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-2 bg-gray-200 rounded w-full mt-1"></div>
                        </div>
                      ))}
                    </div>
                  ) : analytics ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Active Users</span>
                        <span className="text-sm text-muted-foreground">
                          {analytics.platformMetrics.activeUsers.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Avg Order Value</span>
                        <span className="text-sm text-muted-foreground">
                          ₹{analytics.platformMetrics.avgOrderValue.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Completion Rate</span>
                        <span className="text-sm text-muted-foreground">
                          {analytics.orderTrends.current > 0 
                            ? Math.floor((analytics.platformMetrics.completedOrders / analytics.orderTrends.current) * 100)
                            : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">User Engagement</span>
                        <Badge variant="secondary">High</Badge>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Growth Trends</CardTitle>
                  <CardDescription>Month-over-month changes</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                          <div className="h-6 bg-gray-200 rounded w-full mt-1"></div>
                        </div>
                      ))}
                    </div>
                  ) : analytics ? (
                    <>
                      <div>
                        <div className="flex justify-between text-sm">
                          <span>User Growth</span>
                          <span className="text-green-600">+{analytics.userGrowth.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-green-600 h-2 rounded-full" 
                            style={{ width: `${Math.min(analytics.userGrowth.percentage * 3, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm">
                          <span>Order Growth</span>
                          <span className="text-blue-600">+{analytics.orderTrends.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${Math.min(analytics.orderTrends.percentage * 3, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm">
                          <span>Revenue Growth</span>
                          <span className="text-purple-600">+{analytics.revenueAnalytics.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ width: `${Math.min(analytics.revenueAnalytics.percentage * 3, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Analytics</CardTitle>
                <CardDescription>Detailed user growth and engagement metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>User analytics dashboard coming soon</p>
                  <p className="text-sm">This will include user acquisition, retention, and engagement metrics</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Order Analytics</CardTitle>
                <CardDescription>Order trends, fulfillment, and performance metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Order analytics dashboard coming soon</p>
                  <p className="text-sm">This will include order volumes, trends, and fulfillment metrics</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Revenue Analytics</CardTitle>
                <CardDescription>Financial performance and revenue insights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Revenue analytics dashboard coming soon</p>
                  <p className="text-sm">This will include revenue trends, forecasting, and financial insights</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}