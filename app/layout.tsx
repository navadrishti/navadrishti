import type { Metadata } from 'next'
import { Suspense } from 'react'
import './globals.css'
import '@/styles/colors.css'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider } from '@/components/theme-provider'
import { PageTransition } from '@/components/page-transition'
import { Toaster } from 'sonner'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export const metadata: Metadata = {
  title: 'Navadrishti',
  description: 'Created by Shubhendu Chakrabarti',
  generator: 'Shubhendu Chakrabarti',
  icons: {
    icon: '/photos/small-logo.svg',
  },
  verification: {
    google: 'gpXj_x31x2m48aHEkqZPfU5C4FYdOPT0p8DuazmFuxI',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const shouldInjectProtectionScript = process.env.NODE_ENV === 'production'

  return (
    <html lang="en">
      <head>
        {shouldInjectProtectionScript && (
          <Script id="disable-devtools" strategy="afterInteractive">
            {`
              (function() {
                function disableDevTools() {
                  if (typeof window !== 'undefined') {
                    console.log = () => {};
                    console.info = () => {};
                    console.warn = () => {};
                    console.debug = () => {};
                    console.table = () => {};
                    console.dir = () => {};
                    console.trace = () => {};
                    console.group = () => {};
                    console.groupEnd = () => {};
                    console.time = () => {};
                    console.timeEnd = () => {};
                    console.count = () => {};
                    console.countReset = () => {};
                    console.profile = () => {};
                    console.profileEnd = () => {};
                    console.timeStamp = () => {};
                    console.clear = () => {};

                    document.addEventListener('keydown', function(e) {
                      if (e.key === 'F12' || e.keyCode === 123) {
                        e.preventDefault();
                        return false;
                      }

                      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
                        e.preventDefault();
                        return false;
                      }

                      if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
                        e.preventDefault();
                        return false;
                      }
                    }, { capture: true });

                    document.addEventListener('contextmenu', function(e) {
                      e.preventDefault();
                      return false;
                    }, { capture: true });

                    if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object') {
                      for (let prop in window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                        if (prop === 'renderers') {
                          window.__REACT_DEVTOOLS_GLOBAL_HOOK__[prop] = new Map();
                        } else {
                          window.__REACT_DEVTOOLS_GLOBAL_HOOK__[prop] =
                            typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__[prop] === 'function'
                              ? Function.prototype
                              : null;
                        }
                      }
                    }

                    setInterval(function() {
                      const widthThreshold = window.outerWidth - window.innerWidth > 160;
                      const heightThreshold = window.outerHeight - window.innerHeight > 160;

                      if (widthThreshold || heightThreshold) {
                        document.body.innerHTML = 'Developer tools detected. Please close them and refresh the page.';
                      }
                    }, 1000);
                  }
                }

                disableDevTools();
              })();
            `}
          </Script>
        )}
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <AuthProvider>
            <Suspense fallback={null}>
              <PageTransition>
                {children}
              </PageTransition>
            </Suspense>
            <Toaster 
              position="top-right" 
              richColors={false}
              closeButton 
              expand
              visibleToasts={6}
              duration={5000}
              theme="system"
              toastOptions={{
                duration: 5000,
                classNames: {
                  toast: 'nd-toast',
                  title: 'nd-toast-title',
                  description: 'nd-toast-description',
                  closeButton: 'nd-toast-close',
                  actionButton: 'nd-toast-action',
                  cancelButton: 'nd-toast-cancel',
                  success: 'nd-toast-success',
                  error: 'nd-toast-error',
                  warning: 'nd-toast-warning',
                  info: 'nd-toast-info',
                  loading: 'nd-toast-loading'
                }
              }}
            />
          </AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
