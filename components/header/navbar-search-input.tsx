"use client"

import { useState, useEffect, useRef, type KeyboardEventHandler, type FocusEventHandler } from "react"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"

const SEARCH_PLACEHOLDER = "Search people, NGOs, companies..."

function fitPlaceholderWithDots(text: string, el: HTMLInputElement) {
  const style = getComputedStyle(el)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return text

  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const maxWidth = el.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
  if (maxWidth <= 0 || ctx.measureText(text).width <= maxWidth) return text

  const dots = ".."
  const dotsWidth = ctx.measureText(dots).width
  if (dotsWidth >= maxWidth) return dots

  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (ctx.measureText(text.slice(0, mid)).width + dotsWidth <= maxWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return `${text.slice(0, low).trimEnd()}${dots}`
}

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [placeholder, setPlaceholder] = useState(SEARCH_PLACEHOLDER)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return

    const update = () => setPlaceholder(fitPlaceholderWithDots(SEARCH_PLACEHOLDER, el))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative w-full overflow-hidden rounded-[10px] border border-[#DCE1E2] bg-white transition-[border-color,box-shadow] focus-within:border-udaan-orange focus-within:shadow-[0_0_0_3px_rgba(244,123,32,0.14)]">
      <div className="relative bg-white">
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          title={SEARCH_PLACEHOLDER}
          className="w-full border-0 bg-white pl-8 pr-10 text-[#4E5961] placeholder:truncate placeholder:text-gram-faint shadow-none focus:!border-transparent focus:!shadow-none focus-visible:!border-transparent focus-visible:!shadow-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gram-muted" />
        <button
          type="button"
          aria-label="Clear search"
          className={`absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 ${value.trim() ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
