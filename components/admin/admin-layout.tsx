'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from '@/lib/admin-auth-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  LayoutDashboard, 
  Users, 
  ShoppingBag, 
  Briefcase, 
  Settings, 
  BarChart3, 
  Shield, 
  FileText, 
  Bell, 
  Menu, 
  X, 
  LogOut,
  User,
  Eye,
  Star,
  AlertTriangle
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard, permission: 'analytics.read' },
  { 
    name: 'Users', 
    href: '/admin/users', 
    icon: Users, 
    permission: 'users.read',
    badge: 'live'
  },
  { 
    name: 'Marketplace', 
    href: '/admin/marketplace', 
    icon: ShoppingBag, 
    permission: 'marketplace.read',
    submenu: [
      { name: 'All Items', href: '/admin/marketplace', icon: Eye },
      { name: 'Featured Items', href: '/admin/marketplace/featured', icon: Star },
      { name: 'Moderation', href: '/admin/marketplace/moderation', icon: Shield }
    ]
  },
  { 
    name: 'Services', 
    href: '/admin/services', 
    icon: Briefcase, 
    permission: 'services.read',
    submenu: [
      { name: 'Service Requests', href: '/admin/services/requests', icon: FileText },
      { name: 'Service Offers', href: '/admin/services/offers', icon: Briefcase }
    ]
  },
  { 
    name: 'Content Moderation', 
    href: '/admin/moderation', 
    icon: Shield, 
    permission: 'marketplace.moderate',
    badge: 'urgent'
  },
  { name: 'Analytics', href: '/admin/analytics', icon: BarChart3, permission: 'analytics.read' },
  { name: 'Settings', href: '/admin/settings', icon: Settings, permission: 'settings.read' }
];

export function AdminLayout({ children }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { adminUser, logout, hasPermission } = useAdminAuth();
  const pathname = usePathname();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <Link href="/admin/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">Admin Panel</span>
          </Link>
          <button
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            if (!hasPermission(item.permission)) return null;

            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            
            return (
              <div key={item.name}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${isActive 
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-center space-x-3">
                    <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <Badge 
                      variant={item.badge === 'urgent' ? 'destructive' : 'secondary'}
                      className="text-xs"
                    >
                      {item.badge === 'live' ? 'Live' : item.badge === 'urgent' ? '!' : item.badge}
                    </Badge>
                  )}
                </Link>

                {/* Submenu */}
                {item.submenu && isActive && (
                  <div className="ml-8 mt-2 space-y-1">
                    {item.submenu.map((subitem) => (
                      <Link
                        key={subitem.name}
                        href={subitem.href}
                        className={`
                          flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm transition-colors
                          ${pathname === subitem.href 
                            ? 'text-blue-600 bg-blue-50' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                          }
                        `}
                      >
                        <subitem.icon className="w-4 h-4" />
                        <span>{subitem.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Admin user info */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {adminUser?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {adminUser?.role.replace('_', ' ').toUpperCase()}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-gray-400 hover:text-gray-600"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm border-b border-gray-200 lg:static lg:overflow-y-visible">
          <div className="mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative flex justify-between h-16">
              <div className="flex items-center">
                <button
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 lg:hidden"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-6 h-6" />
                </button>
                
                {/* Breadcrumb */}
                <nav className="hidden lg:flex items-center space-x-4 ml-4">
                  <span className="text-sm text-gray-500">Admin</span>
                  <span className="text-gray-300">/</span>
                  <span className="text-sm font-medium text-gray-900 capitalize">
                    {pathname.split('/').pop()?.replace('-', ' ') || 'Dashboard'}
                  </span>
                </nav>
              </div>

              <div className="flex items-center space-x-4">
                {/* Notifications */}
                <button className="p-2 text-gray-400 hover:text-gray-500 relative">
                  <Bell className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-xs text-white font-bold">3</span>
                  </span>
                </button>

                {/* Status indicator */}
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-500">System Online</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}