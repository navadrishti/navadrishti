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
    name: 'text-xl font-bold',
  },
  sm: {
    icon: 'h-9 w-9',
    name: 'text-xl font-bold',
  },
  xs: {
    icon: 'h-[18px] w-[18px]',
    name: 'text-sm font-semibold',
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
      <span className={cn('flex items-center gap-2 leading-none', styles.name, nameClassName)}>
        <img
          src={PRODUCT_LOGO_SRC}
          alt=""
          aria-hidden="true"
          draggable={false}
          className={cn(styles.icon, 'shrink-0 object-contain')}
        />
        <span>
          {PRODUCT_NAME}
          {nameSuffix}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'product-brand-powered block w-full text-center font-medium leading-none',
          poweredClassName ?? 'text-white/75'
        )}
      >
        {PRODUCT_POWERED_BY}
      </span>
    </>
  );

  const sharedClassName = cn(
    'inline-flex w-fit max-w-full shrink-0 flex-col items-stretch justify-center gap-0.5',
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
