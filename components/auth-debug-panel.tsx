'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function AuthDebugPanel() {
  const { user, token, logout } = useAuth();
  const [showPanel, setShowPanel] = useState(false);

  const clearAllAuthData = () => {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Clear sessionStorage
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    
    // Clear cookies manually
    document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    document.cookie = 'user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    
    // Call logout from context
    logout();
    
    // Reload page to ensure clean state
    window.location.reload();
  };

  const testTokenValidity = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      alert(`Token test: ${response.ok ? 'Valid' : 'Invalid'}\n${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      alert(`Token test failed: ${error}`);
    }
  };

  if (process.env.NODE_ENV !== 'development') {
    return null; // Only show in development
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
      >
        Auth Debug
      </button>
      
      {showPanel && (
        <div className="absolute bottom-8 right-0 bg-white border shadow-lg p-4 rounded w-80 text-sm">
          <h3 className="font-bold mb-2">Authentication Debug Panel</h3>
          
          <div className="space-y-2">
            <div>
              <strong>User:</strong> {user ? user.email : 'Not logged in'}
            </div>
            <div>
              <strong>User Type:</strong> {user?.user_type || 'N/A'}
            </div>
            <div>
              <strong>Token:</strong> {token ? `${token.substring(0, 20)}...` : 'No token'}
            </div>
            <div>
              <strong>Local Storage:</strong>
              <ul className="ml-4 text-xs">
                <li>Token: {localStorage.getItem('token') ? 'Present' : 'None'}</li>
                <li>User: {localStorage.getItem('user') ? 'Present' : 'None'}</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 space-y-2">
            <button
              onClick={testTokenValidity}
              className="w-full bg-green-500 text-white px-3 py-1 rounded text-xs"
              disabled={!token}
            >
              Test Token Validity
            </button>
            
            <button
              onClick={clearAllAuthData}
              className="w-full bg-red-500 text-white px-3 py-1 rounded text-xs"
            >
              Clear All Auth Data
            </button>
            
            <button
              onClick={() => window.location.href = '/login'}
              className="w-full bg-blue-500 text-white px-3 py-1 rounded text-xs"
            >
              Go to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}