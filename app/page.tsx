'use client';

import { readApiError } from '@/lib/user-facing-error'
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from '@/components/header';
import { VerificationBadge } from '@/components/verification-badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getGramAvatarFallbackStyle } from '@/lib/gram-avatar';
import { Button } from '@/components/ui/button';
import { ProductBrand } from '@/components/product-brand';
import { useNow } from '@/hooks/use-now';
import { appendNewsletterItems, mergeNewsletterItems } from '@/lib/platform-newsletter/merge';

type NewsletterItem = {
  id: string;
  kind:
    | 'joined'
    | 'verified'
    | 'unverified'
    | 'suspended'
    | 'banned'
    | 'need'
    | 'capability'
    | 'capability_closed'
    | 'capability_used'
    | 'campaign'
    | 'campaign_finished'
    | 'need_fulfilled'
    | 'lead_ngo'
    | 'csr_project';
  actorName: string;
  actorProfileHref: string | null;
  actorType: string;
  actorImage: string | null;
  actorVerificationStatus: string;
  actorBadgeNumber: string | null;
  title: string;
  summary: string;
  href: string | null;
  createdAt: string;
};

const PAGE_SIZE = 15;

function formatTimeAgo(value: string, nowMs: number) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp) || nowMs <= 0) return 'Recently';

  const diffMs = nowMs - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diffMs < week) {
    const days = Math.max(1, Math.floor(diffMs / day));
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (diffMs < month) {
    const weeks = Math.max(1, Math.floor(diffMs / week));
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  const months = Math.max(1, Math.floor(diffMs / month));
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

function formatDateTime(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';
  return new Date(timestamp).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function LandingPage() {
  const [items, setItems] = useState<NewsletterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const nowMs = useNow();
  const loadedCountRef = useRef(0);
  const itemsRef = useRef<NewsletterItem[]>([]);
  const userRequestSeqRef = useRef(0);
  const silentRequestSeqRef = useRef(0);

  const loadNewsletter = useCallback(async (options?: { append?: boolean; silent?: boolean; offset?: number; limit?: number }) => {
    const append = options?.append === true;
    const silent = options?.silent === true;
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? PAGE_SIZE;
    const userRequestSeq = silent ? userRequestSeqRef.current : ++userRequestSeqRef.current;
    const silentRequestSeq = silent ? ++silentRequestSeqRef.current : silentRequestSeqRef.current;

    try {
      if (!silent) {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
      }

      const response = await fetch(`/api/platform-newsletter?limit=${limit}&offset=${offset}`, { cache: 'no-store' });
      const payload = await response.json();
      if (userRequestSeq !== userRequestSeqRef.current) return;
      if (silent && silentRequestSeq !== silentRequestSeqRef.current) return;

      if (!response.ok || !payload?.success) {
        if (silent) return;
        setError(readApiError(payload, 'Failed to load updates.'));
        if (!append) {
          itemsRef.current = [];
          setItems([]);
          setHasMore(false);
        }
        return;
      }

      const nextItems: NewsletterItem[] = Array.isArray(payload.data) ? payload.data : [];
      const total = Number(payload?.pagination?.total);

      if (silent) {
        const merged = mergeNewsletterItems(itemsRef.current, nextItems);
        itemsRef.current = merged;
        setItems(merged);
        if (Number.isFinite(total)) setHasMore(merged.length < total);
        return;
      }

      const nextList = append ? appendNewsletterItems(itemsRef.current, nextItems) : nextItems;
      itemsRef.current = nextList;
      setItems(nextList);
      loadedCountRef.current = append ? offset + nextItems.length : nextItems.length;
      setHasMore(Number.isFinite(total) ? nextList.length < total : Boolean(payload?.pagination?.hasMore));
      setError('');
    } catch {
      if (silent) return;
      setError('Failed to load updates.');
      if (!append) {
        itemsRef.current = [];
        setItems([]);
        setHasMore(false);
      }
    } finally {
      if (!silent && userRequestSeq === userRequestSeqRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadNewsletter({ offset: 0, limit: PAGE_SIZE });
  }, [loadNewsletter]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 px-6 py-8 md:px-10">
        <section>
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gram-ink">
              What&apos;s happening
            </h1>
            <p className="text-muted-foreground">
              A quick look at what&apos;s new across GRAM.
            </p>
          </div>

          <div className="mt-8">
            {loading ? (
              <div className="divide-y divide-slate-200 border-t border-slate-200">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="py-4">
                    <div className="h-3 w-40 rounded bg-slate-200 animate-pulse" />
                    <div className="mt-3 flex gap-3">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 animate-pulse" />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="h-4 w-3/4 rounded bg-slate-200 animate-pulse" />
                        <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="border-t border-gram-border py-10 text-sm text-gram-muted">{error}</div>
            ) : items.length === 0 ? (
              <div className="border-t border-gram-border py-10 text-sm text-gram-muted">
                No major platform updates yet.
              </div>
            ) : (
              <div className="divide-y divide-gram-border/80 border-t border-gram-border">
                {items.map((item) => {
                  const titleSuffix =
                    item.title.startsWith(item.actorName)
                      ? item.title.slice(item.actorName.length).trimStart()
                      : null;
                  const opensDetail = Boolean(item.href) && (
                    item.kind === 'need' ||
                    item.kind === 'capability' ||
                    item.kind === 'capability_closed' ||
                    item.kind === 'capability_used' ||
                    item.kind === 'campaign' ||
                    item.kind === 'campaign_finished' ||
                    item.kind === 'need_fulfilled' ||
                    item.kind === 'lead_ngo' ||
                    item.kind === 'csr_project'
                  );
                  const body = (
                    <div className="py-5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gram-faint">
                        <span>{formatTimeAgo(item.createdAt, nowMs)}</span>
                        <span>{formatDateTime(item.createdAt)}</span>
                      </div>

                      <div className={`mt-2.5 flex gap-3 sm:gap-4 ${item.summary ? 'items-start' : 'items-center'}`}>
                        {item.actorProfileHref ? (
                          <Link href={item.actorProfileHref} className="relative z-10 shrink-0">
                            <Avatar className="h-10 w-10 shrink-0 ring-1 ring-gram-border">
                              <AvatarImage src={item.actorImage || undefined} alt={item.actorName} className="object-cover" />
                              <AvatarFallback
                                className="text-xs font-semibold"
                                style={getGramAvatarFallbackStyle(item.actorName)}
                              >
                                {initials(item.actorName)}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                        ) : (
                          <Avatar className="h-10 w-10 shrink-0 ring-1 ring-gram-border">
                            <AvatarImage src={item.actorImage || undefined} alt={item.actorName} className="object-cover" />
                            <AvatarFallback
                              className="text-xs font-semibold"
                              style={getGramAvatarFallbackStyle(item.actorName)}
                            >
                              {initials(item.actorName)}
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className={`flex flex-wrap gap-x-2 gap-y-1 ${item.summary ? 'items-center' : 'items-center min-h-[2.5rem]'}`}>
                            {titleSuffix ? (
                              <>
                                {item.actorProfileHref ? (
                                  <Link href={item.actorProfileHref} className="relative z-10 text-sm font-medium leading-6 text-gram-ink transition-colors hover:text-udaan-orange">
                                    {item.actorName}
                                  </Link>
                                ) : (
                                  <span className="text-sm font-medium leading-6 text-gram-ink">
                                    {item.actorName}
                                  </span>
                                )}
                                {item.actorVerificationStatus === 'verified' ? (
                                  <VerificationBadge
                                    status="verified"
                                    size="sm"
                                    showText={false}
                                    badgeNumber={null}
                                    className="relative z-10 shrink-0"
                                  />
                                ) : null}
                                <span className="text-sm font-medium leading-6 text-gram-body">
                                  {titleSuffix}
                                </span>
                              </>
                            ) : (
                              <p className="text-sm font-medium leading-6 text-gram-ink">
                                {item.title}
                              </p>
                            )}
                          </div>

                          {item.summary ? (
                            <p className="mt-1 text-sm leading-5 text-gram-muted">
                              {item.summary}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <div
                      key={item.id}
                      className={opensDetail ? 'relative transition-colors hover:bg-slate-50/60' : 'relative'}
                    >
                      {opensDetail && item.href ? (
                        <Link href={item.href} className="absolute inset-0 z-0" aria-label={item.title} />
                      ) : null}
                      {body}
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && !error && hasMore ? (
              <div className="pt-6">
                {loadingMore ? (
                  <div className="space-y-4 border-t border-slate-200 pt-6">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`load-more-skeleton-${index}`} className="py-2">
                        <div className="h-3 w-32 rounded bg-slate-200 animate-pulse" />
                        <div className="mt-3 flex gap-3">
                          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200 animate-pulse" />
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="h-4 w-3/4 rounded bg-slate-200 animate-pulse" />
                            <div className="h-4 w-full rounded bg-slate-100 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto px-0 py-0 text-sm font-medium text-slate-700 hover:bg-transparent hover:text-slate-950"
                      onClick={() => loadNewsletter({ append: true, offset: loadedCountRef.current, limit: PAGE_SIZE })}
                    >
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </main>

      {/* Footer - exact navbar color */}
      <footer className="border-t border-platform-sidebar bg-platform-sidebar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center gap-3 text-sm text-white">
            <span className="text-white text-sm">© {new Date().getFullYear()}</span>
            <ProductBrand size="xs" className="text-white" />
          </div>
        </div>
      </footer>
    </div>
  );
}
