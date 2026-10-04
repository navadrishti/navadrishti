'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function delhiveryTrackingUrl(trackingId: string): string {
  return `https://www.delhivery.com/track-v2/package/${encodeURIComponent(trackingId)}`;
}

export function TrackingIdChip({ trackingId, label = 'AWB' }: { trackingId: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: 'Copy failed', description: 'Select the tracking number and copy it manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="inline-flex max-w-full items-center gap-1 rounded-md border bg-white py-0.5 pl-2 pr-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono font-medium text-foreground select-all">{trackingId}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copy}
        aria-label={copied ? 'Tracking number copied' : 'Copy tracking number'}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <a
        href={delhiveryTrackingUrl(trackingId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
        aria-label="Track on Delhivery"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
