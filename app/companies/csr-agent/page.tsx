"use client"

import { useState, useRef, useEffect } from "react"
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

interface CampaignData {
  name?: string
  focusArea?: string
  targetAudience?: string
  budget?: string
  description?: string
}

export default function CSRAgentPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I\'m your AI CSR Campaign Assistant. I\'ll help you create a powerful CSR campaign. Let\'s start with the basics - what would you like to name your campaign?' }
  ])
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [campaignData, setCampaignData] = useState<CampaignData>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [generatedCampaign, setGeneratedCampaign] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const questions = [
    { key: 'name', question: 'What would you like to name your campaign?' },
    { key: 'focusArea', question: 'Great! What is the main focus area of this campaign? (e.g., Education, Healthcare, Environment)' },
    { key: 'targetAudience', question: 'Perfect! Who is your target audience? (e.g., Underprivileged students, Rural communities)' },
    { key: 'budget', question: 'What is your budget for this campaign in INR?' },
    { key: 'description', question: 'Almost there! Please provide a brief description of your campaign goals and vision.' }
  ]

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])

    // Store the answer
    const currentQuestion = questions[currentStep]
    setCampaignData(prev => ({ ...prev, [currentQuestion.key]: input }))

    setInput("")
    setIsTyping(true)

    // Simulate AI response
    setTimeout(() => {
      if (currentStep < questions.length - 1) {
        const nextQuestion = questions[currentStep + 1]
        setMessages(prev => [...prev, { role: 'assistant', content: nextQuestion.question }])
        setCurrentStep(currentStep + 1)
      } else {
        // Generate campaign
        generateCampaign({ ...campaignData, [currentQuestion.key]: input })
      }
      setIsTyping(false)
    }, 1000)
  }

  const generateCampaign = (data: CampaignData) => {
    setIsTyping(true)
    setTimeout(() => {
      const campaign = {
        name: data.name,
        tagline: "Making a meaningful impact in our community",
        objectives: [
          "Engage 500+ community members",
          "Improve quality of life for beneficiaries",
          "Create measurable social impact"
        ],
        timeline: "6 months",
        metrics: ["Participants enrolled", "Community satisfaction", "Impact stories collected"]
      }

      setGeneratedCampaign(campaign)

      const response = `Excellent! I've created your CSR campaign based on your inputs:\n\n**${campaign.name}**\n\n*Tagline:* ${campaign.tagline}\n\n*Key Objectives:*\n${campaign.objectives.map(obj => `• ${obj}`).join('\n')}\n\n*Timeline:* ${campaign.timeline}\n\n*Success Metrics:*\n${campaign.metrics.map(metric => `• ${metric}`).join('\n')}\n\nYour campaign is ready to launch! Would you like to create another campaign or modify this one?`

      setMessages(prev => [...prev, { role: 'assistant', content: response }])
      setIsTyping(false)
    }, 2000)
  }

  if (user?.user_type !== 'company') {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>This feature is only available for company accounts.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <>
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-udaan-navy mb-2">AI CSR Agent</h1>
          <p className="text-gray-600">Create impactful CSR campaigns with AI assistance</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Side - Chatbot */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-udaan-orange" />
                AI Campaign Assistant
              </CardTitle>
              <CardDescription>Chat with our AI to create your CSR campaign</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col h-[600px]">
                {/* Messages Container */}
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

                {/* Input Container */}
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

          {/* Right Side - Campaign Preview */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-udaan-orange" />
                  Campaign Preview
                </CardTitle>
                <CardDescription>
                  {generatedCampaign 
                    ? "Your campaign is ready!" 
                    : currentStep === 0 && Object.keys(campaignData).length === 0 
                    ? "Your campaign details will appear here as you chat"
                    : "Building your campaign..."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Show collected data while building */}
                {!generatedCampaign && (
                  <>
                    {campaignData.name && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Campaign Name</h3>
                        <p className="text-lg font-bold text-udaan-navy">{campaignData.name}</p>
                      </div>
                    )}
                    
                    {campaignData.focusArea && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Focus Area</h3>
                        <p className="text-gray-700">{campaignData.focusArea}</p>
                      </div>
                    )}
                    
                    {campaignData.targetAudience && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Target Audience</h3>
                        <p className="text-gray-700">{campaignData.targetAudience}</p>
                      </div>
                    )}
                    
                    {campaignData.budget && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Budget</h3>
                        <p className="text-gray-700">₹{campaignData.budget}</p>
                      </div>
                    )}
                    
                    {campaignData.description && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 mb-1">Campaign Description</h3>
                        <p className="text-gray-700">{campaignData.description}</p>
                      </div>
                    )}

                    {isTyping && currentStep >= questions.length && (
                      <div className="flex items-center gap-2 text-udaan-orange">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">AI is generating your campaign strategy...</span>
                      </div>
                    )}

                    {Object.keys(campaignData).length === 0 && (
                      <div className="text-center py-12 text-gray-400">
                        <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Start chatting to build your campaign</p>
                      </div>
                    )}
                  </>
                )}

                {/* Show final generated campaign */}
                {generatedCampaign && (
                  <div className="space-y-4">
                    <div className="border-b pb-2">
                      <h3 className="text-2xl font-bold text-udaan-navy">{generatedCampaign.name}</h3>
                      <p className="text-gray-600 italic mt-1">{generatedCampaign.tagline}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-udaan-navy mb-2">Key Objectives</h4>
                      <ul className="space-y-1">
                        {generatedCampaign.objectives.map((obj: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-udaan-orange mt-1">•</span>
                            <span className="text-gray-700">{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="font-semibold text-udaan-navy mb-2">Timeline</h4>
                      <p className="text-gray-700">{generatedCampaign.timeline}</p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-udaan-navy mb-2">Success Metrics</h4>
                      <ul className="space-y-1">
                        {generatedCampaign.metrics.map((metric: string, idx: number) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-udaan-orange mt-1">•</span>
                            <span className="text-gray-700">{metric}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-4 border-t">
                      <Button className="w-full bg-green-600 hover:bg-green-700">
                        Launch Campaign
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
