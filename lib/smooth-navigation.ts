/**
 * Smooth Navigation Utilities
 * 
 * Provides helper functions for smoother page transitions by adding
 * delays before navigation to allow exit animations to complete.
 * 
 * Usage:
 * - smoothNavigate(router, path, options)
 * - navigateWithLoading(router, path, setLoading, options)
 * - navigateWithScrollToTop(router, path, options)
 */

import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

/**
 * Smooth navigation utility for better UX
 * Adds a small delay before navigation to allow exit animations to complete
 */

export interface SmoothNavigationOptions {
  /** Delay in milliseconds before navigation (default: 150ms) */
  delay?: number;
  /** Whether to replace the current history entry instead of pushing */
  replace?: boolean;
  /** Callback to execute before navigation */
  beforeNavigate?: () => void | Promise<void>;
  /** Callback to execute after initiating navigation */
  afterNavigate?: () => void;
}

/**
 * Navigate smoothly with transition delay
 * @param router - Next.js router instance
 * @param path - Destination path
 * @param options - Navigation options
 */
export async function smoothNavigate(
  router: AppRouterInstance,
  path: string,
  options: SmoothNavigationOptions = {}
): Promise<void> {
  const {
    delay = 150,
    replace = false,
    beforeNavigate,
    afterNavigate
  } = options;

  try {
    // Execute before navigation callback
    if (beforeNavigate) {
      await beforeNavigate();
    }

    // Check if user prefers reduced motion
    const prefersReducedMotion = 
      typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Apply delay only if reduced motion is not preferred
    const actualDelay = prefersReducedMotion ? 0 : delay;

    // Wait for exit animation
    await new Promise(resolve => setTimeout(resolve, actualDelay));

    // Perform navigation
    if (replace) {
      router.replace(path);
    } else {
      router.push(path);
    }

    // Execute after navigation callback
    if (afterNavigate) {
      afterNavigate();
    }
  } catch (error) {
    console.error('Navigation error:', error);
    // Fallback to immediate navigation
    if (replace) {
      router.replace(path);
    } else {
      router.push(path);
    }
  }
}

/**
 * Navigate with a loading state and success callback
 * Useful for form submissions or actions that need confirmation
 */
export async function navigateWithLoading(
  router: AppRouterInstance,
  path: string,
  loadingCallback: (isLoading: boolean) => void,
  options: SmoothNavigationOptions = {}
): Promise<void> {
  loadingCallback(true);
  
  try {
    await smoothNavigate(router, path, {
      ...options,
      afterNavigate: () => {
        loadingCallback(false);
        options.afterNavigate?.();
      }
    });
  } catch (error) {
    loadingCallback(false);
    throw error;
  }
}

/**
 * Scroll to top smoothly before navigating
 * Useful for maintaining consistent UX when navigating between pages
 */
export async function navigateWithScrollToTop(
  router: AppRouterInstance,
  path: string,
  options: Omit<SmoothNavigationOptions, 'beforeNavigate'> = {}
): Promise<void> {
  await smoothNavigate(router, path, {
    ...options,
    beforeNavigate: async () => {
      // Smooth scroll to top
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
      
      // Wait for scroll animation
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  });
}
