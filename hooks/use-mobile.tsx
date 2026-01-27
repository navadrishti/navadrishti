/**
 * Navigation and Mobile Detection Hooks
 * 
 * This file contains hooks for:
 * - Mobile viewport detection
 * - Route change detection and callbacks
 * - Navigation state management
 * - Scroll behavior (auto-scroll, restoration)
 */
import * as React from "react"
import { usePathname, useSearchParams } from 'next/navigation';

const MOBILE_BREAKPOINT = 768

/**
 * Hook to detect mobile viewport
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/**
 * Navigation and Route Change Hooks
 */

interface RouteChangeOptions {
  onRouteChangeStart?: (url: string) => void;
  onRouteChangeComplete?: (url: string) => void;
  onRouteChangeError?: (error: Error) => void;
}

/**
 * Hook to detect route changes and execute callbacks
 */
export function useRouteChange(options: RouteChangeOptions = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isChanging, setIsChanging] = React.useState(false);
  const [previousPath, setPreviousPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');
    
    if (previousPath && previousPath !== url) {
      setIsChanging(true);
      options.onRouteChangeStart?.(url);

      const timer = setTimeout(() => {
        setIsChanging(false);
        options.onRouteChangeComplete?.(url);
      }, 100);

      return () => clearTimeout(timer);
    }

    setPreviousPath(url);
  }, [pathname, searchParams, previousPath, options]);

  return { isChanging, currentPath: pathname };
}

/**
 * Hook to get current navigation state
 */
export function useNavigationState() {
  const [isNavigating, setIsNavigating] = React.useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    setIsNavigating(true);
    
    const timer = setTimeout(() => {
      setIsNavigating(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  return isNavigating;
}

/**
 * Hook to scroll to top on route change
 */
export function useScrollToTopOnRouteChange(behavior: ScrollBehavior = 'smooth') {
  const pathname = usePathname();

  React.useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior
    });
  }, [pathname, behavior]);
}

/**
 * Hook to restore scroll position on back navigation
 */
export function useScrollRestoration() {
  const pathname = usePathname();

  React.useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`scroll-${pathname}`, window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll);

    const savedPosition = sessionStorage.getItem(`scroll-${pathname}`);
    if (savedPosition) {
      window.scrollTo({
        top: parseInt(savedPosition, 10),
        behavior: 'instant'
      });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [pathname]);
}
