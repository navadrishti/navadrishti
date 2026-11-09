"use client"

import type { KeyboardEventHandler, FocusEventHandler } from "react"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/utils"

const SEARCH_PLACEHOLDER = "Search people, NGOs, companies, campaigns…"

export function NavbarSearchInput({
  value,
  onChange,
  onClear,
  onKeyDown,
  onFocus,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onFocus?: FocusEventHandler<HTMLInputElement>
  onBlur?: FocusEventHandler<HTMLInputElement>
}) {
  const hasValue = Boolean(value.trim())

  return (
    <div className="relative w-full overflow-hidden rounded-[10px] border border-[#DCE1E2] bg-white transition-[border-color,box-shadow] focus-within:border-udaan-orange focus-within:shadow-[0_0_0_3px_rgba(244,123,32,0.14)]">
      <div className="relative bg-white">
        <Input
          type="text"
          // Native placeholders can't ellipsize; overlay handles the visible hint.
          placeholder=""
          aria-label={SEARCH_PLACEHOLDER}
          title={SEARCH_PLACEHOLDER}
          className={cn(
            "w-full border-0 bg-white pl-8 text-[#4E5961] shadow-none focus:!border-transparent focus:!shadow-none focus-visible:!border-transparent focus-visible:!shadow-none",
            // Don't reserve clear-button space while empty — that left a large blank gap.
            hasValue ? "pr-10" : "pr-3"
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {!hasValue ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-8 right-3 z-[1] flex items-center overflow-hidden text-sm text-gram-faint"
          >
            <span className="block w-full truncate">{SEARCH_PLACEHOLDER}</span>
          </span>
        ) : null}
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gram-muted" />
        <button
          type="button"
          aria-label="Clear search"
          className={cn(
            "absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700",
            hasValue ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
