"use client"

import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

function NavigationProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(true);
  const [progress, setProgress] = useState(0);
  const [trackedPath, setTrackedPath] = useState(pathname);

  if (trackedPath !== pathname) {
    setTrackedPath(pathname);
    setIsNavigating(true);
    setProgress(0);
  }

  useEffect(() => {
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
  }, [pathname]);

  if (!isNavigating) return null;

  return (
    <div 
      className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-orange-600 shadow-lg shadow-orange-500/50"
      style={{ 
        width: `${progress}%`,
        opacity: progress === 100 ? 0 : 1,
        transition: 'opacity 0.3s ease-out'
      }}
    />
  );
}

function transitionGroup(path: string) {
  if (path.startsWith('/ca/login') || path.startsWith('/ca/change-password')) return path
  if (path.startsWith('/ca')) return '/ca-console'
  if (path.startsWith('/admin/login')) return path
  if (path.startsWith('/admin')) return '/admin-console'
  return path
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const group = transitionGroup(pathname);
  const [displayPath, setDisplayPath] = useState(group);
  const [settledStage, setTransitionStage] = useState<'entering' | 'visible'>('visible');
  const transitionStage = group !== displayPath ? 'exiting' : settledStage;
  
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (transitionStage === 'exiting') {
      const exitTimer = setTimeout(() => {
        setDisplayPath(group)
        setTransitionStage('entering')
      }, prefersReducedMotion ? 0 : 200)

      return () => clearTimeout(exitTimer)
    }

    if (transitionStage === 'entering') {
      const timer = setTimeout(() => {
        setTransitionStage('visible')
      }, prefersReducedMotion ? 0 : 50)

      return () => clearTimeout(timer)
    }
  }, [group, transitionStage])
  
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