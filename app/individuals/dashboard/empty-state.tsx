import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  description: string;
  browseHref?: string;
  browseLabel?: string;
}

export function EmptyState({ title, description, browseHref, browseLabel }: EmptyStateProps) {
  return (
    <div className="p-8 text-center text-muted-foreground">
      <p className="text-lg font-medium mb-2">{title}</p>
      <p className={browseHref ? 'text-sm mb-4' : 'text-sm'}>{description}</p>
      {browseHref ? (
        <Link href={browseHref}>
          <Button variant="outline">{browseLabel}</Button>
        </Link>
      ) : null}
    </div>
  );
}

export function LoadingMessage({ children }: { children: string }) {
  return <div className="p-6 text-center text-muted-foreground">{children}</div>;
}
