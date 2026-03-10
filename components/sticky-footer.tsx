'use client';

import { useEffect, useRef, useState } from 'react';

export function StickyFooter() {
  const footerRef = useRef<HTMLElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const originalTopRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!footerRef.current) return;

      const footerRect = footerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const scrollY = window.scrollY;

      // Store original position when footer first appears
      if (originalTopRef.current === null && footerRect.top <= windowHeight) {
        originalTopRef.current = scrollY + footerRect.top;
      }

      // Check if we should stick
      if (originalTopRef.current !== null) {
        const footerOriginalTop = originalTopRef.current;
        const shouldStick = scrollY + windowHeight >= footerOriginalTop;

        if (shouldStick) {
          setIsSticky(true);
        } else {
          // Scrolled back up past original position
          setIsSticky(false);
          originalTopRef.current = null; // Reset for next time
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial position

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <footer 
      ref={footerRef}
      className={`mt-8 py-4 px-6 transition-all duration-300 ease-in-out ${
        isSticky ? 'sticky bottom-0' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white">
        <a href="/about" className="hover:text-yellow-300 hover:underline transition-colors">About</a>
        <a href="/accessibility" className="hover:text-yellow-300 hover:underline transition-colors">Accessibility</a>
        <a href="/help" className="hover:text-yellow-300 hover:underline transition-colors">Help Center</a>
        <a href="/privacy" className="hover:text-yellow-300 hover:underline transition-colors">Privacy & Terms</a>
        <a href="/advertising" className="hover:text-yellow-300 hover:underline transition-colors">Advertising</a>
        <a href="/contact" className="hover:text-yellow-300 hover:underline transition-colors">Contact</a>
        <span className="text-white/80">© 2026 Navadrishti</span>
      </div>
    </footer>
  );
}
