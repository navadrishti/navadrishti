import Image from 'next/image';

export function ConsoleFooter() {
  return (
    <footer className="mt-auto bg-udaan-blue text-white">
      <div className="udaan-container px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center gap-3 text-sm text-white">
          <span>© {new Date().getFullYear()}</span>
          <Image
            src="/photos/small-logo.svg"
            alt="Navadrishti logo"
            width={18}
            height={18}
            className="h-[18px] w-[18px]"
          />
          <span className="font-semibold">Navadrishti</span>
        </div>
      </div>
    </footer>
  );
}
