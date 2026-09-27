import Link from "next/link"
import { Sparkles, ArrowRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { AGENT_NAMES, AGENT_ROUTES } from "@/lib/ai-agent-sessions"

export function CatalystCtaSkeleton() {
  return (
    <div className="mb-8 p-8 bg-white rounded-md border border-gram-border shadow-sm relative overflow-hidden">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="text-center md:text-left">
          <Skeleton className="h-8 w-72 mb-3" />
          <Skeleton className="h-5 w-full max-w-md" />
        </div>
        <Skeleton className="h-[58px] w-[210px] rounded-lg" />
      </div>
    </div>
  )
}

export function CatalystCta() {
  return (
    <div className="mb-8 relative overflow-hidden rounded-md border border-gram-border bg-white p-8 shadow-sm">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-bold text-black mb-3">
            Launch New CSR Campaign?
          </h2>
          <p className="text-gray-700 text-base max-w-md font-medium">
            Create structured campaign plans through {AGENT_NAMES.catalyst}. Manual campaign creation is disabled.
          </p>
        </div>
        <Link href={AGENT_ROUTES.catalyst}>
          <button className="flex h-auto items-center rounded-md border border-gram-border bg-white px-8 py-4 text-base font-medium text-black shadow-sm transition-all duration-300 hover:bg-gram-page">
            <Sparkles size={20} className="mr-3" />
            Use {AGENT_NAMES.catalyst}
            <ArrowRight size={16} className="ml-3" />
          </button>
        </Link>
      </div>
    </div>
  )
}
