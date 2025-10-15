"use client"

import { usePathname } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Reset visibility state on route change
    setIsVisible(false);
    
    // Trigger enter animation after a small delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 10);
    
    return () => clearTimeout(timer);
  }, [pathname]);
  
  return (
    <div 
      className={`page-transition ${isVisible ? 'page-visible' : 'page-hidden'}`}
    >
      {children}
    </div>
  );
}