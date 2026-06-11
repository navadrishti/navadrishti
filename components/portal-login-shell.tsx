import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type PortalLoginShellProps = {
  portalTitle: string;
  portalSubtitle: string;
  cardTitle?: string;
  cardDescription?: string;
  children: React.ReactNode;
  footerNote?: string;
};

export function PortalLoginShell({
  portalTitle,
  portalSubtitle,
  cardTitle = 'Sign In',
  cardDescription,
  children,
  footerNote,
}: PortalLoginShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">{portalTitle}</h1>
          <p className="text-gray-600">{portalSubtitle}</p>
        </div>

        <Card className="border-2 border-slate-200 shadow-none">
          <CardHeader>
            <CardTitle>{cardTitle}</CardTitle>
            {cardDescription ? <CardDescription>{cardDescription}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        <div className="mt-6 text-center text-sm text-gray-600">
          {footerNote ? <p className="mb-2">{footerNote}</p> : null}
          <p className="inline-flex items-center gap-2">
            © 2026
            <Image
              src="/photos/small-logo.svg"
              alt="Navadrishti logo"
              width={14}
              height={14}
              className="h-3.5 w-3.5"
            />
            Navadrishti Platform
          </p>
        </div>
      </div>
    </div>
  );
}
