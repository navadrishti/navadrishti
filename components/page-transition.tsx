/**
 * Page Transition Component with Navigation Progress Bar
 * 
 * Features:
 * - Smooth page enter/exit animations
 * - Top navigation progress bar
 * - Reduced motion support
 * - Hardware-accelerated transitions
 */

"use client"

import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect, useState, useRef } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

// Navigation Progress Bar Component (integrated)
function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setIsNavigating(true);
    setProgress(0);

    // Smooth continuous progress
    const startTime = Date.now();
    const duration = 1200;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progressValue = Math.min((elapsed / duration) * 90, 90);
      setProgress(progressValue);
      
      if (elapsed < duration) {
        requestAnimationFrame(animate);
      }
    };
    
    const animationFrame = requestAnimationFrame(animate);
    
    const completeTimer = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setIsNavigating(false);
        setProgress(0);
      }, 300);
    }, duration);

    return () => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(completeTimer);
    };
  }, [pathname, searchParams]);

  if (!isNavigating) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/50"
      style={{ 
        width: `${progress}%`,
        opacity: progress === 100 ? 0 : 1,
        transition: 'opacity 0.3s ease-out'
      }}
    />
  );
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [displayPath, setDisplayPath] = useState(pathname);
  const [transitionStage, setTransitionStage] = useState<'entering' | 'visible' | 'exiting'>('entering');
  const exitingRef = useRef(false);
  
  useEffect(() => {
    // Detect if user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    if (pathname !== displayPath) {
      // Start exit animation
      exitingRef.current = true;
      setTransitionStage('exiting');
      
      // Wait for exit animation to complete
      const exitTimer = setTimeout(() => {
        setDisplayPath(pathname);
        setTransitionStage('entering');
        exitingRef.current = false;
        
        // Then trigger enter animation
        const enterTimer = setTimeout(() => {
          setTransitionStage('visible');
        }, prefersReducedMotion ? 0 : 50);
        
        return () => clearTimeout(enterTimer);
      }, prefersReducedMotion ? 0 : 200);
      
      return () => clearTimeout(exitTimer);
    } else if (transitionStage === 'entering') {
      // Initial page load
      const timer = setTimeout(() => {
        setTransitionStage('visible');
      }, prefersReducedMotion ? 0 : 50);
      
      return () => clearTimeout(timer);
    }
  }, [pathname, displayPath, transitionStage]);
  
  // Determine CSS classes based on transition stage
  const getTransitionClass = () => {
    switch (transitionStage) {
      case 'exiting':
        return 'page-exiting';
      case 'entering':
        return 'page-entering';
      case 'visible':
        return 'page-visible';
      default:
        return 'page-entering';
    }
  };
  
  return (
    <>
      <NavigationProgress />
      <div 
        className={`page-transition ${getTransitionClass()}`}
        key={displayPath}
      >
        {children}
      </div>
    </>
  );
}