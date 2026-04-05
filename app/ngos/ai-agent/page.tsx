"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Loader2, Sparkles, Send, Bot, User } from "lucide-react"

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ServiceRequestData {
  projectTitle?: string
  requestTitle?: string
  requestType?: string
  beneficiaryCount?: string
  location?: string
  urgency?: string
  timeline?: string
  estimatedBudget?: string
  impactDescription?: string
  contactInfo?: string
}

type ServiceRequestDraftPayload = {
  source: 'ngo-ai-agent'
  projectMode: 'new'
  project: {
    title: string
    description: string
    location: string
    timeline: string
  }
  needs: Array<{
    title: string
    description: string
    request_type: string
    category: string
    urgency: string
    timeline: string
    budget: string
    estimated_budget: string
    beneficiary_count: string
    impact_description: string
    contactInfo: string
    material_items: string
    skill_role: string
    skill_duration: string
    infrastructure_scope: string
  }>
}

const normalizeRequestType = (value?: string) => {
  const text = String(value || '').toLowerCase()
  if (text.includes('material')) return 'Material Need'
  if (text.includes('infrastructure')) return 'Infrastructure Project'
  return 'Skill / Service Need'
}

const normalizeUrgency = (value?: string) => {
  const text = String(value || '').toLowerCase()
  if (text.includes('critical')) return 'Critical'
  if (text.includes('high')) return 'High'
  if (text.includes('low')) return 'Low'
  return 'Medium'
}

export default function NGOAIAgentPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I\'m your NGO AI Agent. I\'ll help you create a strong service request draft. Let\'s start with the project title.' }
  ])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [requestData, setRequestData] = useState<ServiceRequestData>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [generatedDraft, setGeneratedDraft] = useState<ServiceRequestDraftPayload | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    setMounted(true)
  }, [])

  const questions = [
    { key: 'projectTitle', question: 'What is the project title?' },
    { key: 'requestTitle', question: 'Great. What should be the request title?' },
    { key: 'requestType', question: 'What is the request type? (Material Need, Skill / Service Need, Infrastructure Project)' },
    { key: 'beneficiaryCount', question: 'How many beneficiaries will this request impact?' },
    { key: 'location', question: 'Where is this need located? Please provide exact location.' },
    { key: 'urgency', question: 'What is the urgency level? (Low, Medium, High, Critical)' },
    { key: 'timeline', question: 'What is the timeline/deadline? (or type Anytime)' },
    { key: 'estimatedBudget', question: 'What is the estimated budget? (e.g., INR 1,50,000)' },
    { key: 'impactDescription', question: 'Describe the expected impact in measurable terms.' },
    { key: 'contactInfo', question: 'Provide contact and escalation details for this request.' }
  ] as const

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])

    const currentQuestion = questions[currentStep]
    const nextData = { ...requestData, [currentQuestion.key]: input }
    setRequestData(nextData)

    setInput("")
    setIsTyping(true)

    setTimeout(() => {
      if (currentStep < questions.length - 1) {
        const nextQuestion = questions[currentStep + 1]
        setMessages(prev => [...prev, { role: 'assistant', content: nextQuestion.question }])
        setCurrentStep(currentStep + 1)
      } else {
        generateDraft(nextData)
      }
      setIsTyping(false)
    }, 1000)
  }

  const generateDraft = (data: ServiceRequestData) => {
    setIsTyping(true)
    setTimeout(() => {
      const requestType = normalizeRequestType(data.requestType)
      const urgency = normalizeUrgency(data.urgency)

      const draft: ServiceRequestDraftPayload = {
        source: 'ngo-ai-agent',
        projectMode: 'new',
        project: {
          title: data.projectTitle || 'Community Support Initiative',
          description: `Project focused on ${data.impactDescription || 'improving community outcomes through structured support.'}`,
          location: data.location || 'Location to be confirmed',
          timeline: data.timeline || '3 months'
        },
        needs: [
          {
            title: data.requestTitle || 'Service Support Requirement',
            description: `Support needed to deliver outcomes for ${data.beneficiaryCount || '100'} beneficiaries in ${data.location || 'target location'}.`,
            request_type: requestType,
            category: requestType,
            urgency,
            timeline: data.timeline || 'Anytime',
            budget: 'Negotiable',
            estimated_budget: data.estimatedBudget || 'INR 50,000',
            beneficiary_count: data.beneficiaryCount || '100',
            impact_description: data.impactDescription || 'Measurable improvements for beneficiaries through targeted intervention.',
            contactInfo: data.contactInfo || user?.email || 'ngo@example.org',
            material_items: requestType === 'Material Need' ? 'Specify item list and quantities' : '',
            skill_role: requestType === 'Skill / Service Need' ? 'Specify required role' : '',
            skill_duration: requestType === 'Skill / Service Need' ? 'Specify required duration' : '',
            infrastructure_scope: requestType === 'Infrastructure Project' ? 'Specify infrastructure work scope' : ''
          }
        ]
      }

      setGeneratedDraft(draft)

      const response = `Excellent! I've created your AI-ready service request draft:\n\n**Project:** ${draft.project.title}\n**Need:** ${draft.needs[0].title}\n**Type:** ${draft.needs[0].request_type}\n**Urgency:** ${draft.needs[0].urgency}\n**Beneficiaries:** ${draft.needs[0].beneficiary_count}\n\nYou can now push this draft directly into Create Service Request.`

      setMessages(prev => [...prev, { role: 'assistant', content: response }])
      setIsTyping(false)
    }, 1600)
  }

  const launchCreateRequest = () => {
    if (!generatedDraft) return
    localStorage.setItem('nd_ngo_ai_request_draft', JSON.stringify(generatedDraft))
    router.push('/service-requests/create?source=ai-agent')
  }

  if (!mounted) {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Loading NGO AI Agent</CardTitle>
              <CardDescription>Preparing your workspace...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Initializing page shell...
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Loading NGO AI Agent</CardTitle>
              <CardDescription>Preparing your workspace...</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Please wait while we verify your access.
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    )
  }

  if (user?.user_type !== 'ngo') {
    return (
      <>
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>This feature is only available for NGO accounts.</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">NGO AI Agent</h1>
          <p className="text-gray-600">Create high-quality service request drafts with AI assistance</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-udaan-orange" />
                AI Request Assistant
              </CardTitle>
              <CardDescription>Chat with AI to build your service request</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col h-[600px]">
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-4">
                  {messages.map((message, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-3 ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-udaan-orange flex items-center justify-center">
                            <Bot className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-lg p-4 ${
                          message.role === 'user'
                            ? 'bg-udaan-orange text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === 'user' && (
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-udaan-navy flex items-center justify-center">
                            <User className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-3 justify-start">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full bg-udaan-orange flex items-center justify-center">
                          <Bot className="h-5 w-5 text-white" />
                        </div>
                      </div>
                      <div className="bg-gray-100 rounded-lg p-4">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="flex gap-2 border-t pt-4">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type your response..."
                    disabled={isTyping}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="bg-udaan-orange hover:bg-udaan-orange/90"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-udaan-orange" />
                  Request Preview
                </CardTitle>
                <CardDescription>
                  {generatedDraft
                    ? "Your service request draft is ready!"
                    : currentStep === 0 && Object.keys(requestData).length === 0
                    ? "Draft details will appear here as you chat"
                    : "Building your request draft..."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!generatedDraft && (
                  <>
                    {requestData.projectTitle && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Project Title</h3>
                        <p className="text-lg font-bold text-udaan-navy">{requestData.projectTitle}</p>
                      </div>
                    )}

                    {requestData.requestTitle && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Request Title</h3>
                        <p className="text-gray-700">{requestData.requestTitle}</p>
                      </div>
                    )}

                    {requestData.requestType && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Request Type</h3>
                        <p className="text-gray-700">{normalizeRequestType(requestData.requestType)}</p>
                      </div>
                    )}

                    {requestData.beneficiaryCount && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Beneficiaries</h3>
                        <p className="text-gray-700">{requestData.beneficiaryCount}</p>
                      </div>
                    )}

                    {requestData.estimatedBudget && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Estimated Budget</h3>
                        <p className="text-gray-700">{requestData.estimatedBudget}</p>
                      </div>
                    )}

                    {Object.keys(requestData).length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Start chatting to build your request</p>
                      </div>
                    )}
                  </>
                )}

                {generatedDraft && (
                  <div className="space-y-4">
                    <div className="border-b pb-2">
                      <h3 className="text-2xl font-bold text-udaan-navy">{generatedDraft.project.title}</h3>
                      <p className="text-gray-600 mt-1">{generatedDraft.project.description}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-udaan-navy mb-2">Generated Need</h4>
                      <ul className="space-y-1 text-gray-700">
                        <li><strong>Title:</strong> {generatedDraft.needs[0].title}</li>
                        <li><strong>Type:</strong> {generatedDraft.needs[0].request_type}</li>
                        <li><strong>Urgency:</strong> {generatedDraft.needs[0].urgency}</li>
                        <li><strong>Beneficiaries:</strong> {generatedDraft.needs[0].beneficiary_count}</li>
                        <li><strong>Timeline:</strong> {generatedDraft.needs[0].timeline}</li>
                      </ul>
                    </div>

                    <div className="pt-4 border-t">
                      <Button className="w-full bg-green-600 hover:bg-green-700" onClick={launchCreateRequest}>
                        Use This Draft in Create Request
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  )
}
