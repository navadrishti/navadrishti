import { useState } from "react"
import {
  type ConversationStage,
  type Message,
  type NeedIntakeData,
  type ProjectIntakeData,
  type ServiceRequestDraftPayload,
  INITIAL_ASSISTANT_MESSAGE,
} from "./intake"

export type IntakePath = 'need' | 'project' | null

export function useIntakeState() {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: INITIAL_ASSISTANT_MESSAGE }])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [projectData, setProjectData] = useState<ProjectIntakeData>({})
  const [needsData, setNeedsData] = useState<NeedIntakeData[]>([])
  const [needCount, setNeedCount] = useState<number | null>(null)
  const [projectStep, setProjectStep] = useState(0)
  const [activeNeedIndex, setActiveNeedIndex] = useState(0)
  const [activeNeedQuestionIndex, setActiveNeedQuestionIndex] = useState(0)
  const [conversationStage, setConversationStage] = useState<ConversationStage>('entry')
  const [intakePath, setIntakePath] = useState<IntakePath>(null)
  const [generatedDraft, setGeneratedDraft] = useState<ServiceRequestDraftPayload | null>(null)
  const [publishedProjectId, setPublishedProjectId] = useState<string | null>(null)
  const [publishingDraft, setPublishingDraft] = useState(false)

  return {
    messages,
    setMessages,
    input,
    setInput,
    isTyping,
    setIsTyping,
    projectData,
    setProjectData,
    needsData,
    setNeedsData,
    needCount,
    setNeedCount,
    projectStep,
    setProjectStep,
    activeNeedIndex,
    setActiveNeedIndex,
    activeNeedQuestionIndex,
    setActiveNeedQuestionIndex,
    conversationStage,
    setConversationStage,
    intakePath,
    setIntakePath,
    generatedDraft,
    setGeneratedDraft,
    publishedProjectId,
    setPublishedProjectId,
    publishingDraft,
    setPublishingDraft,
  }
}

export type IntakeState = ReturnType<typeof useIntakeState>
