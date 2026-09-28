"use client"

import type React from "react"
import { useMemo, useState } from "react"
import Image from "next/image"
import { Loader2, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { PRODUCT_LOGO_SRC } from "@/lib/access-control"
import { getEditingMessageContext } from "./conversation"
import type { Message } from "./intake"

type ChatMessageListProps = {
  messages: Message[]
  isTyping: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  needCount: number | null
  userName?: string
  userAvatar: string
  userInitials: string
  onSaveEdit: (messageIndex: number, content: string) => void
}

function AssistantAvatar() {
  return (
    <div className="flex-shrink-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm">
        <Image src={PRODUCT_LOGO_SRC} alt="GRAM" width={28} height={28} className="h-7 w-7 object-contain" />
      </div>
    </div>
  )
}

export function ChatMessageList({
  messages,
  isTyping,
  containerRef,
  needCount,
  userName,
  userAvatar,
  userInitials,
  onSaveEdit,
}: ChatMessageListProps) {
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string>("")

  const editingMessageContext = useMemo(
    () => getEditingMessageContext(messages, editingMessageIndex, needCount),
    [editingMessageIndex, messages, needCount]
  )

  const saveEdit = (messageIndex: number) => {
    const newContent = String(editingText || '').trim()
    if (!newContent) return
    onSaveEdit(messageIndex, newContent)
    setEditingMessageIndex(null)
    setEditingText('')
  }

  return (
    <div ref={containerRef} className="min-h-0 max-h-[11.5rem] flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-2 sm:max-h-[13.5rem] lg:max-h-none">
      <div className="space-y-4">
        {messages.map((message, idx) => (
          <div
            key={idx}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && <AssistantAvatar />}

            <div className="flex items-center gap-2">
              <div
                className={`min-w-[4rem] sm:min-w-[6rem] max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[85%] whitespace-normal break-normal ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-[#1d4ed8] to-[#2563eb] text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                {message.role === 'user' && editingMessageIndex === idx ? (
                  <div className="space-y-3">
                    <Input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="h-11 rounded-xl border-white/30 bg-white/95 text-slate-900 placeholder:text-slate-500"
                    />
                    {editingMessageContext?.options && editingMessageContext.options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {editingMessageContext.options.map((option) => (
                          <Button
                            key={option}
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-8 rounded-full bg-white/20 px-3 text-xs text-white hover:bg-white/30"
                            onClick={() => setEditingText(option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => { setEditingMessageIndex(null); setEditingText("") }}>Cancel</Button>
                      <Button size="sm" onClick={() => saveEdit(idx)}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-normal break-normal">{message.content}</p>
                )}
              </div>

              {message.role === 'user' && editingMessageIndex !== idx && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-8 w-8 rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                      aria-label="Message options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={() => { setEditingMessageIndex(idx); setEditingText(message.content) }}>Edit</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {message.role === 'user' && (
              <div className="flex-shrink-0">
                {userAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- profile photos are user-uploaded URLs from arbitrary hosts
                  <img
                    src={userAvatar}
                    alt={userName || 'User'}
                    className="h-9 w-9 rounded-full border border-slate-200 object-cover shadow-lg shadow-slate-900/15"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2563eb] text-xs font-semibold text-white shadow-lg shadow-[#2563eb]/20">
                    {userInitials}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="flex gap-3 justify-start">
            <AssistantAvatar />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
