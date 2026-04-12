"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type StyledSelectProps = {
  value: string
  options: Array<string | { value: string; label: string }>
  placeholder?: string
  onValueChange: (value: string) => void
  className?: string
}

export function StyledSelect({
  value,
  options,
  placeholder = "Select option",
  onValueChange,
  className
}: StyledSelectProps) {
  const [open, setOpen] = useState(false)

  const normalizedOptions = useMemo(
    () => options.map((option) => (typeof option === "string" ? { value: option, label: option } : option)),
    [options]
  )

  const currentLabel = normalizedOptions.find((option) => option.value === value)?.label || placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn(
            "h-10 w-full justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal",
            className
          )}
        >
          <span className="truncate">{currentLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1">
        <div className="max-h-72 overflow-auto">
          {normalizedOptions.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onClick={() => {
                  onValueChange(option.value)
                  setOpen(false)
                }}
              >
                <span>{option.label}</span>
                {isActive && <Check className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
