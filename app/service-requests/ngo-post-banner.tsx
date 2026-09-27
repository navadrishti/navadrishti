import Link from 'next/link'
import { ArrowRight, Plus, Sparkles } from 'lucide-react'
import type { ListingKind } from './types'

const postButtonClass =
  'flex h-auto items-center whitespace-nowrap rounded-lg border border-gram-border bg-white px-6 py-4 text-base font-medium text-black shadow-sm transition-all duration-300 hover:bg-gram-page'

export function NgoPostBanner({ listingKind }: { listingKind: ListingKind }) {
  const isProjects = listingKind === 'projects'

  return (
    <div className="relative mb-8 overflow-hidden rounded-md border border-gram-border bg-white p-8 shadow-sm">
      <div className="relative z-10 flex flex-col items-center justify-between gap-6 md:flex-row">
        <div className="text-center md:text-left">
          <h2 className="mb-3 text-2xl font-bold text-black">
            {isProjects
              ? 'Ready to post a CSR project?'
              : 'Need individual help on the ground?'}
          </h2>
          <p className="max-w-md text-base font-medium text-gray-700">
            {isProjects
              ? 'Create a full project package for company CSR takeover.'
              : 'Post a standalone need for individuals to fulfil.'}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={isProjects ? '/service-requests/projects/create' : '/service-requests/create'}>
            <button className={postButtonClass}>
              <Plus size={18} className="mr-2" />
              {isProjects ? 'Post a Project' : 'Post a Need'}
            </button>
          </Link>
          <Link href="/ngos/ai-agent">
            <button className="flex h-auto items-center whitespace-nowrap rounded-lg border-2 border-udaan-blue bg-udaan-blue px-6 py-4 text-base font-medium text-white transition-all duration-300 hover:bg-udaan-blue/90">
              <Sparkles size={18} className="mr-2" />
              Use Atlas AI
              <ArrowRight size={16} className="ml-2" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
