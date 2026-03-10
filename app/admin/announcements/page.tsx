'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X,
  Megaphone,
  Sparkles,
  Clock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Announcement {
  id: string;
  type: 'announcement' | 'changelog';
  title: string;
  timestamp: string;
}

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  
  const [formData, setFormData] = useState({
    type: 'announcement' as 'announcement' | 'changelog',
    title: ''
  });

  useEffect(() => {
    const checkAdminAuth = async () => {
      try {
        const response = await fetch('/api/admin/verify', {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          router.push('/admin/login');
          return;
        }

        setIsAdmin(true);
        fetchAnnouncements();
      } catch (error) {
        console.error('Admin auth check failed:', error);
        router.push('/admin/login');
      }
    };

    checkAdminAuth();
  }, [router]);

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('/api/admin/announcements');
      const data = await response.json();
      if (data.success) {
        setAnnouncements(data.announcements);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.title.trim()) return;

    try {
      const response = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await fetchAnnouncements();
        setAdding(false);
        setFormData({ type: 'announcement', title: '' });
      }
    } catch (error) {
      console.error('Error adding announcement:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const response = await fetch(`/api/admin/announcements?id=${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchAnnouncements();
      }
    } catch (error) {
      console.error('Error deleting announcement:', error);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Button
            onClick={() => router.push('/admin')}
            variant="outline"
            className="mb-4"
          >
            ← Back to Admin Dashboard
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Announcements</h1>
          <p className="text-gray-600">Add, edit, or delete platform announcements and changelogs</p>
        </div>

        {/* Add New Announcement */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Add New Announcement</span>
              <Button
                onClick={() => setAdding(!adding)}
                variant={adding ? "outline" : "default"}
                size="sm"
              >
                {adding ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                {adding ? 'Cancel' : 'Add New'}
              </Button>
            </CardTitle>
          </CardHeader>
          {adding && (
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <div className="flex gap-3">
                  <Button
                    variant={formData.type === 'announcement' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, type: 'announcement' })}
                    className="flex items-center gap-2"
                  >
                    <Megaphone className="w-4 h-4" />
                    Announcement
                  </Button>
                  <Button
                    variant={formData.type === 'changelog' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, type: 'changelog' })}
                    className="flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Changelog
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., New Feature: Dark Mode"
                  className="w-full"
                />
              </div>

              <Button onClick={handleAdd} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                Save Announcement
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Announcements List */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Loading announcements...
              </CardContent>
            </Card>
          ) : announcements.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                No announcements yet. Add your first one!
              </CardContent>
            </Card>
          ) : (
            announcements.map((announcement) => (
              <Card key={announcement.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="secondary" className={
                          announcement.type === 'announcement' 
                            ? 'bg-orange-100 text-orange-800' 
                            : 'bg-pink-100 text-pink-800'
                        }>
                          {announcement.type === 'announcement' ? (
                            <><Megaphone className="w-3 h-3 mr-1" /> Announcement</>
                          ) : (
                            <><Sparkles className="w-3 h-3 mr-1" /> Changelog</>
                          )}
                        </Badge>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(announcement.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{announcement.title}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(announcement.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
