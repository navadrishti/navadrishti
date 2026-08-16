import Image from 'next/image';
import { PRODUCT_BRAND_CLASSNAME, PRODUCT_LOGO_ALT, PRODUCT_LOGO_ICON_SRC, PRODUCT_NAME } from '@/lib/access-control';

export function ConsoleFooter() {
  return (
    <footer className="mt-auto bg-udaan-blue text-white">
      <div className="udaan-container px-4 py-4 sm:px-6 lg:px-8">
        <div className={`flex items-center justify-center gap-3 text-sm text-white ${PRODUCT_BRAND_CLASSNAME}`}>
          <span>© {new Date().getFullYear()}</span>
          <Image
            src={PRODUCT_LOGO_ICON_SRC}
            alt={PRODUCT_LOGO_ALT}
            width={18}
            height={18}
            draggable={false}
            className="h-[18px] w-[18px]"
          />
          <span className="font-semibold">{PRODUCT_NAME}</span>
        </div>
      </div>
    </footer>
  );
}
