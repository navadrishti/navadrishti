"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type StyledSelectOption =
  | string
  | {
      value: string
      label: string
      bulletClassName?: string
    }

type StyledSelectProps = {
  value: string
  options: StyledSelectOption[]
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
    () =>
      options.map((option) =>
        typeof option === "string"
          ? { value: option, label: option, bulletClassName: undefined as string | undefined }
          : option
      ),
    [options]
  )

  const current = normalizedOptions.find((option) => option.value === value)
  const currentLabel = current?.label || placeholder

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
          <span className="flex min-w-0 items-center gap-2">
            {current?.bulletClassName ? (
              <span className={cn("h-2 w-2 shrink-0 rounded-full", current.bulletClassName)} aria-hidden="true" />
            ) : null}
            <span className="truncate">{currentLabel}</span>
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1 overscroll-contain">
        <div className="max-h-72 overflow-auto overscroll-contain">
          {normalizedOptions.map((option) => {
            const isActive = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                  isActive ? "bg-slate-100 text-slate-900" : "hover:bg-slate-50"
                )}
                onClick={() => {
                  onValueChange(option.value)
                  setOpen(false)
                }}
              >
                {option.bulletClassName ? (
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", option.bulletClassName)} aria-hidden="true" />
                ) : (
                  <span className="h-2 w-2 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
