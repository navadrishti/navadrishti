import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  PRODUCT_BRAND_CLASSNAME,
  PRODUCT_LOGO_SRC,
  PRODUCT_NAME,
  PRODUCT_POWERED_BY,
} from '@/lib/access-control';

type ProductBrandProps = {
  href?: string;
  size?: 'md' | 'sm' | 'xs';
  /** Extra text after the product name, e.g. " Platform" */
  nameSuffix?: string;
  className?: string;
  nameClassName?: string;
  poweredClassName?: string;
  onClick?: () => void;
};

const sizeStyles = {
  md: {
    icon: 'h-10 w-10',
    name: 'text-xl font-bold leading-none',
    powered: 'text-[10px] leading-tight',
    gap: 'gap-2.5',
  },
  sm: {
    icon: 'h-9 w-9',
    name: 'text-xl font-bold leading-none',
    powered: 'text-[10px] leading-tight',
    gap: 'gap-2',
  },
  xs: {
    icon: 'h-7 w-7',
    name: 'text-sm font-semibold leading-none',
    powered: 'text-[10px] leading-tight',
    gap: 'gap-2',
  },
} as const;

export function ProductBrand({
  href,
  size = 'md',
  nameSuffix = '',
  className,
  nameClassName,
  poweredClassName,
  onClick,
}: ProductBrandProps) {
  const styles = sizeStyles[size];
  const content = (
    <>
      <img
        src={PRODUCT_LOGO_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(styles.icon, 'shrink-0 object-contain')}
      />
      <span className="flex min-w-0 flex-col items-start justify-center gap-0.5">
        <span className={cn(styles.name, nameClassName)}>
          {PRODUCT_NAME}
          {nameSuffix}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'product-brand-powered font-medium',
            styles.powered,
            poweredClassName ?? 'text-white/75'
          )}
        >
          {PRODUCT_POWERED_BY}
        </span>
      </span>
    </>
  );

  const sharedClassName = cn(
    'inline-flex w-fit max-w-full shrink-0 items-center',
    styles.gap,
    PRODUCT_BRAND_CLASSNAME,
    className
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={sharedClassName}>
        {content}
      </Link>
    );
  }

  return (
    <div className={sharedClassName} onClick={onClick}>
      {content}
    </div>
  );
}

/** Compact © year + G logo + GRAM for auth/page footers (undraggable / unselectable). */
export function ProductCopyright({
  className,
  suffix = '',
}: {
  className?: string;
  /** Extra text after the product name, e.g. " Platform" */
  suffix?: string;
}) {
  return (
    <p
      className={cn(
        PRODUCT_BRAND_CLASSNAME,
        'inline-flex items-center justify-center gap-1.5 text-sm text-gray-600',
        className
      )}
    >
      <span>© {new Date().getFullYear()}</span>
      <img
        src={PRODUCT_LOGO_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-4 w-4 shrink-0 object-contain"
      />
      <span>
        {PRODUCT_NAME}
        {suffix}
      </span>
    </p>
  );
}
