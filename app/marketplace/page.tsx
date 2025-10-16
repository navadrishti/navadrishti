'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ProductCard } from '@/components/product-card'
import { Search, PackagePlus, Trash2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'

const categories = [
  'All Categories',
  'Clothing & Textiles',
  'Food & Nutrition', 
  'Medical & Healthcare',
  'Education & Books',
  'Office & Supplies',
  'Household Items',
  'Furniture & Home',
  'Baby & Children',
  'Personal Care',
  'Transportation',
  'Emergency Supplies',
  'Tools & Equipment',
  'Other'
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
      
      const response = await fetch(`/api/marketplace?${params.toString()}`);
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
          <div className="text-center py-8">
            <p>Loading marketplace...</p>
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
          {user && user.user_type !== 'ngo' && (
            <Link href="/marketplace/create">
              <Button>
                <PackagePlus size={16} className="mr-2" />
                List Item
              </Button>
            </Link>
          )}
        </div>

        <Tabs value={currentView} onValueChange={handleTabChange} className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto">
              <TabsTrigger value="all">All Items</TabsTrigger>
              <TabsTrigger value="featured">Featured</TabsTrigger>
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
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
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
                  image={item.images?.[0] || "https://images.unsplash.com/photo-1441986300917-64674bd600d8"}
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
                <div className="col-span-full text-center py-8">
                  <p className="text-muted-foreground">No items found matching your criteria.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="featured" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.filter((item: any) => item.featured).map((item: any) => (
                <ProductCard
                  key={item.id}
                  title={item.title}
                  description={`${item.description} • Quantity: ${item.quantity}`}
                  category={item.category}
                  price={item.price}
                  image={item.images?.[0] || "https://images.unsplash.com/photo-1441986300917-64674bd600d8"}
                  provider={item.seller_name}
                  providerType={item.seller_type}
                  location={item.seller_location}
                  tags={Array.isArray(item.tags) ? item.tags : []}
                  item={item}
                  badge={<Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Featured</Badge>}
                  showDeleteButton={!!(user && user.id === item.seller_id)}
                  onDelete={() => handleDeleteItem(item.id)}
                  isDeleting={deleting === item.id}
                />
              ))}
              {filteredItems.filter((item: any) => item.featured).length === 0 && (
                <div className="col-span-full text-center py-8">
                  <p className="text-muted-foreground">No featured items found.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="nearby" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredItems.filter((item: any) => item.seller_location).map((item: any) => (
                <ProductCard
                  key={item.id}
                  title={item.title}
                  description={`${item.description} • Quantity: ${item.quantity}`}
                  category={item.category}
                  price={item.price}
                  image={item.images?.[0] || "https://images.unsplash.com/photo-1441986300917-64674bd600d8"}
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
              {filteredItems.filter((item: any) => item.seller_location).length === 0 && (
                <div className="col-span-full text-center py-8">
                  <p className="text-muted-foreground">No nearby items available.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}