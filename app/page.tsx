'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

// Photo grid - using public images
const photos = [
  '/photos/pic 1.jpeg',
  '/photos/pic 2.jpeg',
  '/photos/pic 3.jpeg',
  '/photos/pic 4.jpeg',
  '/photos/pic 5.jpeg',
  '/photos/pic 6.jpeg',
  '/photos/pic 7.jpeg',
  '/photos/pic 8.jpeg',
  '/photos/pic 9.jpeg',
  '/photos/pic 10.jpeg',
  '/photos/pic 11.jpeg',
  '/photos/pic 12.jpeg',
  '/photos/pic 13.jpeg',
  '/photos/pic 14.jpeg',
  '/photos/pic 15.jpeg',
];

// Organize photos into 4 rows
const rows = [
  photos.slice(0, 5),
  photos.slice(5, 10),
  photos.slice(10, 15),
  [...photos.slice(15, 15), ...photos.slice(0, 4)], // Last 5 for row 4
];

const mobileRows = [
  photos.slice(0, 4),
  photos.slice(4, 8),
  photos.slice(8, 12),
  photos.slice(12, 15),
];

const repeatRow = <T,>(row: T[]) => [...row, ...row];

// Animation keyframes
const scrollAnimations = `
  @keyframes marquee {
    0% { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(-50%, 0, 0); }
  }
  @keyframes marqueeReverse {
    0% { transform: translate3d(-50%, 0, 0); }
    100% { transform: translate3d(0, 0, 0); }
  }
  .marquee-track {
    width: max-content;
    will-change: transform;
    backface-visibility: hidden;
    transform: translate3d(0, 0, 0);
  }
  .marquee-segment {
    display: flex;
    gap: 4px;
    width: calc(100vw - 16px);
    min-width: calc(100vw - 16px);
    flex-shrink: 0;
  }
  .mobile-marquee {
    opacity: 1;
    isolation: isolate;
  }
  .mobile-marquee-track {
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    contain: layout paint;
  }
  .scroll-left {
    animation: marquee 26s linear infinite;
  }
  .scroll-right {
    animation: marqueeReverse 26s linear infinite;
  }
  .hero-photo-mask {
    background: linear-gradient(135deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.1) 100%);
  }
  .hero-text-bg {
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(4px);
    border-radius: 16px;
    padding: 1.5rem 1.25rem;
  }
  .hero-button {
    transition: all 0.3s ease;
  }
  .hero-button:hover {
    transform: translateY(-2px);
  }
`;

function HeroContent() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getDashboardLink = () => {
    if (!mounted || !user) return '/login';
    if (user.user_type === 'company') return '/companies/dashboard';
    if (user.user_type === 'ngo') return '/ngos/dashboard';
    return '/individuals/dashboard';
  };

  return (
    <>
      {/* Hero Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 py-16 md:py-20">
        <div className="text-center max-w-3xl hero-text-bg">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-3" style={{ textShadow: '0 4px 12px rgba(0, 0, 0, 0.5)' }}>
            Navadrishti
          </h1>

          <p className="text-lg md:text-xl mb-4 font-semibold" style={{ color: '#F47B20', textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }}>
            Where Impact Meets Connection
          </p>

          <p className="text-sm md:text-base text-white max-w-2xl mx-auto mb-8 leading-relaxed" style={{ textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)' }}>
            A platform for people and organizations to collaborate on meaningful social impact, share opportunities, and drive change together.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={getDashboardLink()}>
              <Button className="hero-button h-11 px-7 text-sm bg-udaan-blue text-white font-semibold shadow-lg hover:shadow-xl hover:opacity-90">
                User Dashboard
              </Button>
            </Link>
            <a href="https://navadrishti.in" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="hero-button h-11 px-7 text-sm border-2 border-white text-white bg-transparent hover:bg-white/20 font-semibold shadow-lg hover:shadow-xl">
                About Navadrishti
              </Button>
            </a>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-3 border-t border-white/30 pt-4 sm:max-w-2xl sm:mx-auto">
            <Link href="/government-admin">
              <Button className="hero-button h-10 px-5 text-xs bg-udaan-orange text-white font-semibold shadow-lg hover:shadow-xl hover:opacity-90 w-full">
                Government Administrator
              </Button>
            </Link>
            <Link href="/companies/ca">
              <Button className="hero-button h-10 px-5 text-xs bg-udaan-blue text-white font-semibold shadow-lg hover:shadow-xl hover:opacity-90 w-full">
                Evidence Verification Portal
              </Button>
            </Link>
            <Link href="/ca">
              <Button className="hero-button h-10 px-5 text-xs bg-udaan-blue/80 text-white font-semibold shadow-lg hover:shadow-xl hover:opacity-90 w-full">
                Navadrishti CA Portal
              </Button>
            </Link>
            <div className="sm:col-span-3 flex flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
                 <Link href="/government-admin/district-dashboard" className="w-full sm:w-64">
                   <Button className="hero-button h-10 px-5 text-xs bg-udaan-blue text-white font-semibold shadow-lg hover:shadow-xl hover:bg-udaan-orange/90 w-full">
                     District Analytics Portal
                   </Button>
                 </Link>
                 <Link href="/government-admin/state-dashboard" className="w-full sm:w-64">
                   <Button className="hero-button h-10 px-5 text-xs bg-udaan-orange text-white font-semibold shadow-lg hover:shadow-xl hover:bg-udaan-orange/90 w-full">
                     State Analytics Portal
                   </Button>
                 </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <style>{scrollAnimations}</style>
      <Header />

      {/* Photo Grid Background Container */}
      <div className="relative flex-1 overflow-hidden bg-white">
        {/* Mobile scrolling rows */}
        <div className="hero-photo-mask mobile-marquee absolute inset-0 grid grid-rows-4 gap-3 px-3 py-4 pointer-events-none overflow-hidden md:hidden">
          {mobileRows.map((row, rowIdx) => (
            <div key={`mobile-row-${rowIdx}`} className="flex min-h-0 items-stretch overflow-hidden">
              <div
                className={`marquee-track mobile-marquee-track ${rowIdx % 2 === 0 ? 'scroll-left' : 'scroll-right'}`}
                style={{
                  display: 'flex',
                  minWidth: '400%',
                }}
              >
                {Array.from({ length: 4 }).map((_, segmentIdx) => (
                  <div
                    key={`mobile-row-${rowIdx}-segment-${segmentIdx}`}
                    className="marquee-segment"
                    aria-hidden={segmentIdx > 0 ? 'true' : undefined}
                  >
                    {row.map((photo, idx) => (
                      <div
                        key={`mobile-row-${rowIdx}-${segmentIdx}-${idx}`}
                        className="h-full flex-1 min-w-0 aspect-square overflow-hidden bg-slate-100"
                      >
                        <img src={photo} alt={segmentIdx === 0 ? `Impact ${idx + 1}` : ''} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>

        {/* Scrolling Photo Rows */}
        <div className="hero-photo-mask absolute inset-0 hidden flex-col pointer-events-none opacity-85 md:flex" style={{ padding: '12px', gap: '12px' }}>
          {rows.map((row, rowIdx) => (
            <div
              key={rowIdx}
              className="flex-1 flex items-center overflow-hidden"
            >
              <div
                className={`marquee-track ${rowIdx % 2 === 0 ? 'scroll-left' : 'scroll-right'}`}
                style={{
                  display: 'flex',
                  gap: '12px',
                  minWidth: '100%',
                }}
              >
                {repeatRow(row).map((photo, idx) => (
                  <div
                    key={`${rowIdx}-repeat-${idx}`}
                    className="flex-shrink-0 h-full aspect-square bg-slate-100 overflow-hidden"
                    style={{ width: `calc(20% - 6.4px)` }}
                  >
                    <img src={photo} alt={`Impact ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <HeroContent />
      </div>

      {/* Footer - exact navbar color */}
      <footer className="border-t" style={{ backgroundColor: '#0067b9', borderColor: '#0067b9' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center gap-3 text-sm text-white">
            <span className="text-white text-sm">© {new Date().getFullYear()}</span>
            <div className="flex items-center gap-2">
              <Image
                src="/photos/small-logo.svg"
                alt="Navadrishti logo"
                width={20}
                height={20}
                className="h-[20px] w-[20px]"
              />
              <span className="font-semibold text-white">Navadrishti</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
