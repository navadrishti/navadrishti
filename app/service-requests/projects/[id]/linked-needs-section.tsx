import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatStatusLabel } from '@/lib/format-date';
import { getNeedImage, statusBadgeClass } from './helpers';
import type { NeedGroupKey, NeedItem } from './types';

const NEED_GROUPS: Array<{ key: NeedGroupKey; title: string }> = [
  { key: 'ongoing', title: 'Ongoing Needs' },
  { key: 'fulfilled', title: 'Fulfilled Needs' },
  { key: 'removed', title: 'Removed Needs' },
];

const COLLAPSED_LIMIT = 5;

type LinkedNeedsSectionProps = {
  needBreakdown: Record<NeedGroupKey, NeedItem[]>;
  expandedGroups: Record<NeedGroupKey, boolean>;
  onToggleGroup: (key: NeedGroupKey) => void;
};

export function LinkedNeedsSection({ needBreakdown, expandedGroups, onToggleGroup }: LinkedNeedsSectionProps) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        These needs were linked before projects became standalone CSR packages. New projects do not include child needs.
      </p>
      {NEED_GROUPS.map((group) => (
        <NeedGroup
          key={group.key}
          title={group.title}
          items={needBreakdown[group.key]}
          isExpanded={expandedGroups[group.key]}
          onToggle={() => onToggleGroup(group.key)}
        />
      ))}
    </>
  );
}

type NeedGroupProps = {
  title: string;
  items: NeedItem[];
  isExpanded: boolean;
  onToggle: () => void;
};

function NeedGroup({ title, items, isExpanded, onToggle }: NeedGroupProps) {
  const sortedItems = [...items].sort((a, b) => Number(b.id) - Number(a.id));
  const visibleItems = isExpanded ? sortedItems : sortedItems.slice(0, COLLAPSED_LIMIT);
  const remainingCount = Math.max(0, sortedItems.length - visibleItems.length);

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-900">{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">No needs in this section.</p>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((need) => (
            <NeedRow key={need.id} need={need} />
          ))}

          {sortedItems.length > COLLAPSED_LIMIT ? (
            <div className="pt-1">
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-2 text-xs text-slate-700 hover:text-slate-900"
                onClick={onToggle}
              >
                <span>{isExpanded ? 'Show recent 5' : `Show all (${sortedItems.length})`}</span>
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                {!isExpanded && remainingCount > 0 ? <span className="ml-1 text-[11px] text-slate-500">+{remainingCount}</span> : null}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NeedRow({ need }: { need: NeedItem }) {
  const needImage = getNeedImage(need);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
          {needImage ? (
            <img src={needImage} alt={need.title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-500">
              No Image
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-1 text-sm font-semibold text-slate-950">{need.title}</p>
            <Badge className={statusBadgeClass(need.status)}>{formatStatusLabel(need.status)}</Badge>
          </div>

          <p className="line-clamp-1 text-xs text-slate-600">{need.description || 'No description provided.'}</p>

          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
              <p className="truncate text-xs font-medium text-slate-800">{need.request_type || need.category || 'Need'}</p>
            </div>
            <Link href={`/service-requests/${need.id}`}>
              <Button variant="outline" size="sm" className="h-7 rounded-md border-slate-300 px-3 text-xs font-medium text-slate-700">
                View
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
