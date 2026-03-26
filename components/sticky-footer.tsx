'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

interface StickyFooterProps {
  className?: string;
  textClassName?: string;
  linkClassName?: string;
  mutedTextClassName?: string;
  disableSticky?: boolean;
}

export function StickyFooter({
  className = '',
  textClassName = 'text-white',
  linkClassName = 'hover:text-yellow-300 hover:underline transition-colors',
  mutedTextClassName = 'text-white/80',
  disableSticky = false
}: StickyFooterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const [footerMetrics, setFooterMetrics] = useState({ left: 0, width: 0, height: 0 });

  useEffect(() => {
    const updateMetrics = () => {
      if (disableSticky || !wrapperRef.current || !footerRef.current) return;

      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const footerRect = footerRef.current.getBoundingClientRect();

      setFooterMetrics({
        left: wrapperRect.left,
        width: wrapperRect.width,
        height: footerRect.height
      });
    };

    const handleScroll = () => {
      if (disableSticky || !wrapperRef.current || !footerRef.current) return;

      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      const shouldStick = wrapperRect.top <= window.innerHeight;

      setIsSticky(shouldStick);
      updateMetrics();
    };

    if (!disableSticky) {
      updateMetrics();
      window.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('resize', updateMetrics);
      handleScroll();
    }

    return () => {
      if (!disableSticky) {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', updateMetrics);
      }
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="mt-8"
      style={!disableSticky && isSticky ? { minHeight: `${footerMetrics.height}px` } : undefined}
    >
      <footer
        ref={footerRef}
        className={`py-4 px-6 transition-all duration-300 ease-in-out ${className} ${
          !disableSticky && isSticky ? 'fixed bottom-0 z-40' : ''
        }`}
        style={!disableSticky && isSticky ? { left: footerMetrics.left, width: footerMetrics.width } : undefined}
      >
        <div className={`flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs ${textClassName}`}>
          <a href="/about" className={linkClassName}>About</a>
          <a href="/accessibility" className={linkClassName}>Accessibility</a>
          <a href="/help" className={linkClassName}>Help Center</a>
          <a href="/privacy" className={linkClassName}>Privacy & Terms</a>
          <a href="/advertising" className={linkClassName}>Advertising</a>
          <a href="/contact" className={linkClassName}>Contact</a>
          <span className={`inline-flex items-center gap-2 ${mutedTextClassName}`}>
            © 2026
            <Image
              src="/photos/small-logo.svg"
              alt="Navadrishti logo"
              width={14}
              height={14}
              className="h-3.5 w-3.5"
            />
            Navadrishti
          </span>
        </div>
      </footer>
    </div>
  );
}
