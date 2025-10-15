import type { Metadata } from 'next'
import './globals.css'
import '@/styles/colors.css'
import { AuthProvider } from '@/lib/auth-context'
import { CartProvider } from '@/lib/cart-context'
import { ThemeProvider } from '@/components/theme-provider'
import { PageTransition } from '@/components/page-transition'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Navdrishti',
  description: 'Created with v0',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <Script id="disable-devtools" strategy="beforeInteractive">
          {`
            (function() {
              function disableDevTools() {
                // Disable all console output except errors
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
                  
                  // Disable developer keyboard shortcuts
                  document.addEventListener('keydown', function(e) {
                    // Prevent F12 key
                    if (e.key === 'F12' || e.keyCode === 123) {
                      e.preventDefault();
                      return false;
                    }
                    
                    // Prevent Ctrl+Shift+I/J/C/R
                    if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) {
                      e.preventDefault();
                      return false;
                    }
                    
                    // Prevent Ctrl+Shift+R
                    if (e.ctrlKey && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
                      e.preventDefault();
                      return false;
                    }
                  }, { capture: true });
                  
                  // Disable context menu (right-click inspection)
                  document.addEventListener('contextmenu', function(e) {
                    if (process.env.NODE_ENV === 'production') {
                      e.preventDefault();
                      return false;
                    }
                  }, { capture: true });
                
                  // Disable React DevTools
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
                
                  // Continuously check for DevTools
                  setInterval(function() {
                    // Check if DevTools is open via window size detection
                    const widthThreshold = window.outerWidth - window.innerWidth > 160;
                    const heightThreshold = window.outerHeight - window.innerHeight > 160;
                    
                    if (widthThreshold || heightThreshold) {
                      document.body.innerHTML = 'Developer tools detected. Please close them and refresh the page.';
                    }
                    
                    // Re-disable React DevTools if they were re-enabled
                    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && window.__REACT_DEVTOOLS_GLOBAL_HOOK__.inject !== Function.prototype) {
                      disableReactDevTools();
                    }
                  }, 1000);
                }
              }
              
              // Only run in production
              if (process.env.NODE_ENV === 'production') {
                disableDevTools();
              }
            })();
          `}
        </Script>
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <PageTransition>
                {children}
              </PageTransition>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
