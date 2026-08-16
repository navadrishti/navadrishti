import { ProductBrand } from '@/components/product-brand';

export function ConsoleFooter() {
  return (
    <footer className="mt-auto bg-udaan-blue text-white">
      <div className="udaan-container px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-3 text-sm text-white">
          <span>© {new Date().getFullYear()}</span>
          <ProductBrand size="xs" className="text-white" />
        </div>
      </div>
    </footer>
  );
}
