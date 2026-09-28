'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NgoNeedCardSkeleton, NgoNeedDashboardInline } from './need-dashboard';
import type { NeedsTrackingTab, NgoNeedDashboardItem } from './types';

interface NeedsSectionProps {
  ongoingNeeds: NgoNeedDashboardItem[];
  historyNeeds: NgoNeedDashboardItem[];
  loading: boolean;
  tab: NeedsTrackingTab;
  onTabChange: (tab: NeedsTrackingTab) => void;
  onNeedUpdated: () => void | Promise<void>;
}

function NeedListSkeleton() {
  return (
    <div className="space-y-3">
      <NgoNeedCardSkeleton />
      <NgoNeedCardSkeleton />
    </div>
  );
}

export function NeedsSection({ ongoingNeeds, historyNeeds, loading, tab, onTabChange, onNeedUpdated }: NeedsSectionProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-medium">My Needs</h3>
          <p className="text-sm text-muted-foreground">Standalone needs for individuals. Company CSR applications live under My Projects.</p>
        </div>
        <Link href="/service-requests/create">
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Request
          </Button>
        </Link>
      </div>

      <Tabs value={tab === 'ongoing-needs' || tab === 'history-needs' ? tab : 'ongoing-needs'} onValueChange={(value) => onTabChange(value as NeedsTrackingTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="ongoing-needs">Ongoing ({ongoingNeeds.length})</TabsTrigger>
          <TabsTrigger value="history-needs">History ({historyNeeds.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="ongoing-needs" className="mt-4 space-y-3">
          {loading ? (
            <NeedListSkeleton />
          ) : ongoingNeeds.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">No ongoing needs</p>
              <p className="text-sm">Accepted and active requests will appear here until fulfillment is confirmed.</p>
            </div>
          ) : ongoingNeeds.map((request) => (
            <NgoNeedDashboardInline
              key={request.id}
              need={request}
              variant="ongoing"
              onUpdated={onNeedUpdated}
            />
          ))}
        </TabsContent>

        <TabsContent value="history-needs" className="mt-4 space-y-3">
          {loading ? (
            <NeedListSkeleton />
          ) : historyNeeds.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">No history yet</p>
              <p className="text-sm">Completed or cancelled requests will appear here.</p>
            </div>
          ) : historyNeeds.map((request) => (
            <NgoNeedDashboardInline
              key={request.id}
              need={request}
              variant="history"
            />
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
