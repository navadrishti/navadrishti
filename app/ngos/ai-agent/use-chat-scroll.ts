import { useEffect, useLayoutEffect, useRef } from "react"
import {
  captureMobileChatScrollPosition,
  restoreMobileChatScrollPosition,
  scrollAgentMessagesContainer,
} from "@/lib/ai-agent-sessions"
import type { IntakeState } from "./use-intake-state"

/** Keeps the chat pinned to the latest message and stops mobile pages jumping while typing. */
export function useChatScroll({ messages, projectData, needsData, needCount, generatedDraft }: IntakeState) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const mobileChatScrollYRef = useRef<number | null>(null)

  const lockMobileChatScroll = () => {
    mobileChatScrollYRef.current = captureMobileChatScrollPosition()
  }

  useEffect(() => {
    scrollAgentMessagesContainer(messagesContainerRef.current)
  }, [messages])

  useLayoutEffect(() => {
    restoreMobileChatScrollPosition(mobileChatScrollYRef.current)
  }, [messages, projectData, needsData, needCount, generatedDraft])

  return { messagesContainerRef, lockMobileChatScroll }
}
