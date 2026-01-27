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
      className={`mt-8 py-4 px-6 ${
        isSticky ? 'sticky bottom-0 bg-gray-50/95 backdrop-blur-sm shadow-lg' : 'opacity-100'
      }`}
      style={{
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease-in-out, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isSticky ? 'translateY(0)' : 'none',
        willChange: 'transform, opacity',
      }}
    >
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-600">
        <a href="/about" className="hover:text-pink-600 hover:underline">About</a>
        <a href="/accessibility" className="hover:text-pink-600 hover:underline">Accessibility</a>
        <a href="/help" className="hover:text-pink-600 hover:underline">Help Center</a>
        <a href="/privacy" className="hover:text-pink-600 hover:underline">Privacy & Terms</a>
        <a href="/advertising" className="hover:text-pink-600 hover:underline">Advertising</a>
        <a href="/contact" className="hover:text-pink-600 hover:underline">Contact</a>
        <span className="text-gray-500">© 2026 Navadrishti</span>
      </div>
    </footer>
  );
}
