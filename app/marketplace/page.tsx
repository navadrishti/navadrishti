'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/product-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonCard, SkeletonHeader } from '@/components/ui/skeleton'
import { Search, PackagePlus, Trash2, Plus, ArrowRight, ShoppingBag } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'

const categories = [
  'All Categories',
  'Clothing & Apparel',
  'Books & Stationery',
  'Electronics & Devices',
  'Furniture',
  'Toys & Kids Items',
  'Medical Supplies',
  'Groceries & Essentials',
  'Home & Kitchen Items',
  'Sports Equipment',
  'Beauty & Personal Care',
  'Arts & Crafts',
  'Tools & Hardware',
  'Bicycles & Vehicles',
  'Pet Supplies',
  'Handmade NGO Products',
  'Upcycled Products',
  'Sustainable Goods',
  'Local Community Listings',
  'Free Giveaways',
  'Donation Items'
];

export default function MarketplacePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [currentView, setCurrentView] = useState('all');
  const [marketplaceItems, setMarketplaceItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  // Delete marketplace item function
  const handleDeleteItem = async (itemId: number) => {
    if (!user) return;
    
    if (!confirm('Are you sure you want to delete this marketplace item? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(itemId);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/marketplace/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Success",
          description: "Marketplace item deleted successfully",
        });
        // Refresh the list
        fetchMarketplaceItems();
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to delete marketplace item",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete marketplace item",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  };

  const fetchMarketplaceItems = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== 'All Categories') {
        params.append('category', selectedCategory);
      }
      if (searchTerm) {
        params.append('search', searchTerm);
      }
      if (user?.id) {
        params.append('userId', user.id.toString());
      }
      params.append('view', currentView);
      
      // Prepare headers for authentication (needed for nearby view)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      // Add authorization header if user is logged in and we need location-based filtering
      if (user && (currentView === 'nearby' || currentView === 'my-listings')) {
        const token = localStorage.getItem('token');
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
      
      const response = await fetch(`/api/marketplace?${params.toString()}`, {
        headers
      });
      const data = await response.json();
      
      if (data.success) {
        setMarketplaceItems(data.data);
      } else {
        setError('Failed to fetch marketplace items');
      }
    } catch (err) {
      setError('Error fetching marketplace items');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchTerm, currentView, user?.id]);

  useEffect(() => {
    fetchMarketplaceItems();
  }, [fetchMarketplaceItems]);

  const handleTabChange = useCallback((value: string) => {
    setCurrentView(value);
  }, []);

  const filteredItems = marketplaceItems;

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          {/* Header Skeleton */}
          <div className="mb-8">
            <SkeletonHeader />
          </div>

          {/* CTA Section Skeleton */}
          {user && (
            <div className="mb-8 p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl border border-gray-700 shadow-2xl relative overflow-hidden">
              {/* Background gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-pink-600/10 to-indigo-600/10 pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                <div className="text-center md:text-left space-y-3">
                  <div className="h-8 bg-gray-700 rounded-md w-64 animate-pulse"></div>
                  <div className="h-5 bg-gray-700 rounded-md w-80 animate-pulse"></div>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="h-12 bg-gray-700 rounded-lg w-40 animate-pulse"></div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs and Controls Skeleton */}
          <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="h-10 bg-gray-200 rounded-md w-72 animate-pulse"></div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="h-10 bg-gray-200 rounded-md w-80 animate-pulse"></div>
                <div className="h-10 bg-gray-200 rounded-md w-48 animate-pulse"></div>
              </div>
            </div>

            {/* Products Grid Skeleton */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 px-6 py-8 md:px-10">
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={fetchMarketplaceItems}>Try Again</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      
      <main className="flex-1 px-6 py-8 md:px-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
            <p className="text-muted-foreground">
              Buy and sell items to support community initiatives
            </p>
          </div>
        </div>

        {/* Enhanced Call-to-Action Section for Listing Items */}
        {user && (
          <div className="mb-8 p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-black rounded-2xl border border-gray-700 shadow-2xl relative overflow-hidden">
            {/* Background gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-pink-600/10 to-indigo-600/10 pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
              <div className="text-center md:text-left">
                <h2 className="text-2xl font-bold text-white mb-3">
                  Got items to sell or donate?
                </h2>
                <p className="text-gray-300 text-base max-w-md">
                  Help your community by listing items others might need. It's quick and easy!
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/marketplace/create">
                  <button className="gradient-border-btn shadow-xl text-white transition-all duration-300 px-8 py-4 h-auto font-medium text-base">
                    <Plus size={20} className="mr-3" />
                    List Your Item
                    <ArrowRight size={16} className="ml-3" />
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}

        <Tabs value={currentView} onValueChange={handleTabChange} className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid w-full grid-cols-2 lg:w-auto">
              <TabsTrigger value="all">All Items</TabsTrigger>
              <TabsTrigger value="nearby">Nearby</TabsTrigger>
            </TabsList>
            
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full sm:w-[300px]"
                />
              </div>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="all" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item: any) => (
                <ProductCard
                  key={item.id}
                  title={item.title}
                  description={`${item.description} • Quantity: ${item.quantity}`}
                  category={item.category}
                  price={item.price}
                  image={item.images?.[0] || ""}
                  provider={item.seller_name}
                  providerType={item.seller_type}
                  location={item.seller_location}
                  tags={Array.isArray(item.tags) ? item.tags : []}
                  item={item}
                  badge={null}
                  showDeleteButton={!!(user && user.id === item.seller_id)}
                  onDelete={() => handleDeleteItem(item.id)}
                  isDeleting={deleting === item.id}
                />
              ))}
              {filteredItems.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="max-w-md mx-auto">
                    <div className="mb-4">
                      <ShoppingBag size={48} className="mx-auto text-gray-400 mb-4" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No items found</h3>
                    <p className="text-gray-500 mb-6">
                      {currentView === 'all' ? 
                        "No items match your search criteria." :
                        `No ${currentView} items available right now.`
                      }
                    </p>
                    {user && user.user_type !== 'ngo' && (
                      <Link href="/marketplace/create">
                        <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                          <Plus size={18} className="mr-2" />
                          Be the first to list an item
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="nearby" className="space-y-6">
            {!user && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 text-blue-800">
                  <span className="text-sm">
                    📍 Sign in to see items from your area based on your profile location
                  </span>
                </div>
              </div>
            )}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item: any) => (
                <ProductCard
                  key={item.id}
                  title={item.title}
                  description={`${item.description} • Quantity: ${item.quantity}`}
                  category={item.category}
                  price={item.price}
                  image={item.images?.[0] || ""}
                  provider={item.seller_name}
                  providerType={item.seller_type}
                  location={item.seller_location}
                  tags={Array.isArray(item.tags) ? item.tags : []}
                  item={item}
                  badge={null}
                  showDeleteButton={!!(user && user.id === item.seller_id)}
                  onDelete={() => handleDeleteItem(item.id)}
                  isDeleting={deleting === item.id}
                />
              ))}
              {filteredItems.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <div className="max-w-md mx-auto">
                    <div className="mb-4">
                      <ShoppingBag size={48} className="mx-auto text-gray-400 mb-4" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No nearby items</h3>
                    <p className="text-gray-500 mb-6">
                      {user ? 
                        "No items found in your area. Update your profile location to see nearby items." :
                        "Sign in and add your location to see nearby items."
                      }
                    </p>
                    {user && user.user_type !== 'ngo' && (
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link href="/marketplace/create">
                          <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                            <Plus size={18} className="mr-2" />
                            List your item
                          </Button>
                        </Link>
                        <Link href="/profile">
                          <Button variant="outline" size="lg">
                            Update Location
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}