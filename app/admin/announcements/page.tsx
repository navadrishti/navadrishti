'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AdminConsoleHeader, AdminPortalMain, AdminPortalShell } from '../admin-layout-client';
import {
  Plus,
  Trash2,
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

function AnnouncementsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-9 w-64 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="h-5 w-full max-w-xl animate-pulse rounded bg-slate-100" />
      </div>
      <div className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-24 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="h-5 w-56 max-w-full animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
              </div>
              <div className="h-9 w-20 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
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
        await fetchAnnouncements();
      } catch (error) {
        console.error('Admin auth check failed:', error);
        router.push('/admin/login');
      }
    };

    void checkAdminAuth();
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

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' });
    } finally {
      router.push('/admin/login');
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
    <AdminPortalShell>
      <AdminConsoleHeader onLogout={handleLogout} />

      <AdminPortalMain className="max-w-4xl space-y-6 overflow-visible">
        {loading ? (
          <AnnouncementsSkeleton />
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Manage Announcements</h1>
              <p className="text-muted-foreground">Add, edit, or delete platform announcements and changelogs</p>
            </div>

            <Card className="w-full border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-xl">
                  <span>Add New Announcement</span>
                  <Button
                    onClick={() => setAdding(!adding)}
                    variant={adding ? 'outline' : 'default'}
                    size="sm"
                  >
                    {adding ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                    {adding ? 'Cancel' : 'Add New'}
                  </Button>
                </CardTitle>
              </CardHeader>
              {adding && (
                <CardContent className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Type</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        variant={formData.type === 'announcement' ? 'default' : 'outline'}
                        onClick={() => setFormData({ ...formData, type: 'announcement' })}
                        className="flex items-center gap-2"
                      >
                        <Megaphone className="h-4 w-4" />
                        Announcement
                      </Button>
                      <Button
                        variant={formData.type === 'changelog' ? 'default' : 'outline'}
                        onClick={() => setFormData({ ...formData, type: 'changelog' })}
                        className="flex items-center gap-2"
                      >
                        <Sparkles className="h-4 w-4" />
                        Changelog
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Title</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="e.g., New Feature: Dark Mode"
                      className="w-full"
                    />
                  </div>

                  <Button onClick={handleAdd} className="w-full sm:w-auto">
                    <Save className="mr-2 h-4 w-4" />
                    Save Announcement
                  </Button>
                </CardContent>
              )}
            </Card>

            <div className="w-full space-y-3">
              {announcements.length === 0 ? (
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="p-8 text-center text-slate-600">
                    No announcements yet. Add your first one!
                  </CardContent>
                </Card>
              ) : (
                announcements.map((announcement) => (
                  <Card key={announcement.id} className="w-full border-slate-200 shadow-sm transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-3">
                            <Badge
                              variant="secondary"
                              className={
                                announcement.type === 'announcement'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-pink-100 text-pink-800'
                              }
                            >
                              {announcement.type === 'announcement' ? (
                                <>
                                  <Megaphone className="mr-1 h-3 w-3" /> Announcement
                                </>
                              ) : (
                                <>
                                  <Sparkles className="mr-1 h-3 w-3" /> Changelog
                                </>
                              )}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(announcement.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900">{announcement.title}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(announcement.id)}
                          className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </>
        )}
      </AdminPortalMain>
    </AdminPortalShell>
  );
}
