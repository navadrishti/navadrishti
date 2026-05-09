"use client";

import { useEffect } from "react";
import { usePathname } from 'next/navigation';

type AuthUnloadWrapperProps = {
  children: React.ReactNode;
  logoutUrl?: string;
  cookieNames?: string[];
};

export default function AuthUnloadWrapper({ children, logoutUrl = '/api/admin/logout', cookieNames = ['admin-token'] }: AuthUnloadWrapperProps) {
  const pathname = usePathname();
  const isLoginRoute = pathname?.endsWith('/login');

  useEffect(() => {
    if (isLoginRoute) {
      return;
    }

    const clearAuthCookies = () => {
      try {
        cookieNames.forEach((name) => {
          document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax;`;
        });
      } catch (e) {
        // ignore
      }
    };

    const sendLogoutRequest = (url: string) => {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(url);
          return;
        }
      } catch (e) {}

      try {
        fetch(url, { method: 'POST', keepalive: true, credentials: 'include' }).catch(() => {});
        return;
      } catch (e) {}

      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, false);
        xhr.withCredentials = true;
        xhr.send(null);
      } catch (e) {}
    };

    const unloadHandler = () => {
      try {
        sendLogoutRequest(logoutUrl);
        clearAuthCookies();
      } catch (e) {
        // ignore
      }
    };

    window.addEventListener('beforeunload', unloadHandler);
    return () => window.removeEventListener('beforeunload', unloadHandler);
  }, [cookieNames, isLoginRoute, logoutUrl]);

  return <>{children}</>;
}
