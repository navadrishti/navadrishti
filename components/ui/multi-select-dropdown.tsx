"use client"

import { useMemo } from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type SelectOption = string | { value: string; label: string }

type MultiSelectDropdownProps = {
  value: string[]
  options: SelectOption[]
  placeholder?: string
  onValueChange: (value: string[]) => void
  className?: string
}

export function MultiSelectDropdown({
  value,
  options,
  placeholder = "Select options",
  onValueChange,
  className,
}: MultiSelectDropdownProps) {
  const normalizedOptions = useMemo(
    () => options.map((option) => (typeof option === "string" ? { value: option, label: option } : option)),
    [options]
  )

  const selectedSet = useMemo(() => new Set(value), [value])
  const selectedLabels = normalizedOptions
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label)

  const triggerLabel =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2} more`

  const toggleValue = (nextValue: string) => {
    const nextSet = new Set(value)

    if (nextSet.has(nextValue)) {
      nextSet.delete(nextValue)
    } else {
      nextSet.add(nextValue)
    }

    onValueChange(normalizedOptions.filter((option) => nextSet.has(option.value)).map((option) => option.value))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 w-full justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal",
            className
          )}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 max-h-80 overflow-auto p-1" align="start">
        <DropdownMenuLabel>Choose impact areas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {normalizedOptions.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selectedSet.has(option.value)}
            onCheckedChange={() => toggleValue(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}