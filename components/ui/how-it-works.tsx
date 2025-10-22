'use client'

import { useState, useEffect, useRef } from 'react'
import { Award, Briefcase, ShoppingBag, ArrowRight, CheckCircle, Users, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface Step {
  id: number
  icon: React.ReactNode
  title: string
  description: string
  details: string[]
  color: string
  bgColor: string
  route: string
}

const steps: Step[] = [
  {
    id: 1,
    icon: <Award className="h-8 w-8 text-white" />,
    title: "Service Requests",
    description: "NGOs post volunteer opportunities and service requests for community projects",
    details: [
      "NGOs create detailed service requests",
      "Individuals and companies browse opportunities", 
      "Apply to help with specific projects",
      "Connect with meaningful causes"
    ],
    color: "text-udaan-navy",
    bgColor: "bg-udaan-navy",
    route: "/service-requests"
  },
  {
    id: 2,
    icon: <Briefcase className="h-8 w-8 text-white" />,
    title: "Service Offers", 
    description: "Professionals offer their skills and expertise to support NGOs and communities",
    details: [
      "Create professional service offerings",
      "Showcase your skills and experience",
      "Set your availability and rates",
      "Get hired for meaningful projects"
    ],
    color: "text-udaan-blue",
    bgColor: "bg-udaan-blue",
    route: "/service-offers"
  },
  {
    id: 3,
    icon: <ShoppingBag className="h-8 w-8 text-white" />,
    title: "Marketplace",
    description: "Buy and sell goods while supporting social causes and community initiatives",
    details: [
      "List items for sale or donation",
      "Shop from socially conscious sellers",
      "Support community initiatives",
      "Find essential supplies and resources"
    ],
    color: "text-udaan-orange", 
    bgColor: "bg-udaan-orange",
    route: "/marketplace"
  }
]

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0)
  const [visibleSteps, setVisibleSteps] = useState<number[]>([])
  const [autoPlay, setAutoPlay] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)

  // Auto-advance steps
  useEffect(() => {
    if (autoPlay && visibleSteps.length === steps.length) {
      intervalRef.current = setInterval(() => {
        setActiveStep((prev) => (prev + 1) % steps.length)
      }, 4000)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [autoPlay, visibleSteps.length])

  // Handle intersection observer for step animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Make all steps visible when section comes into view
            setVisibleSteps([0, 1, 2])
          }
        })
      },
      { 
        threshold: 0.2,
        rootMargin: '0px 0px -50px 0px'
      }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  const handleStepClick = (index: number) => {
    setActiveStep(index)
    setAutoPlay(false)
    // Resume auto-play after longer delay on mobile (touch interactions)
    const isMobile = window.innerWidth < 768
    setTimeout(() => setAutoPlay(true), isMobile ? 12000 : 8000)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    
    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > 50
    const isRightSwipe = distance < -50

    if (isLeftSwipe && activeStep < steps.length - 1) {
      handleStepClick(activeStep + 1)
    }
    if (isRightSwipe && activeStep > 0) {
      handleStepClick(activeStep - 1)
    }
  }

  return (
    <section 
      ref={sectionRef}
      className="w-full py-8 sm:py-12 md:py-16 lg:py-20 bg-udaan-cream overflow-hidden"
    >
      <div className="udaan-container px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="flex flex-col items-center justify-center space-y-3 sm:space-y-4 text-center mb-8 sm:mb-12">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tighter text-udaan-navy md:text-4xl">
              How It Works
            </h2>
            <p className="max-w-[600px] sm:max-w-[900px] text-sm sm:text-base text-udaan-navy/80 md:text-xl/relaxed px-4 sm:px-0">
              Connect through service requests, professional offerings, and marketplace - building bridges between NGOs and skilled volunteers.
            </p>
          </div>
        </div>

        {/* Interactive Steps */}
        <div className="mx-auto max-w-6xl">
          {/* Step Navigation - Responsive */}
          <div className="flex justify-center mb-6 md:mb-8">
            <div className="flex items-center space-x-2 sm:space-x-4 bg-white/50 backdrop-blur-sm rounded-full p-1.5 sm:p-2">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => handleStepClick(index)}
                  className={`
                    relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full
                    transition-all duration-500 transform
                    ${activeStep === index 
                      ? `${step.bgColor} scale-110 shadow-lg shadow-black/20` 
                      : 'bg-white/70 hover:bg-white hover:scale-105'
                    }
                    ${visibleSteps.includes(index) ? 'animate-fadeIn' : 'opacity-0'}
                  `}
                  style={{
                    animationDelay: `${index * 200}ms`
                  }}
                >
                  <span className={`text-lg sm:text-xl font-bold ${
                    activeStep === index ? 'text-white' : step.color
                  }`}>
                    {step.id}
                  </span>
                  
                  {/* Progress ring */}
                  {activeStep === index && (
                    <div className="absolute inset-0 rounded-full border-2 border-white/30">
                      <div 
                        className="absolute inset-0 rounded-full border-2 border-white border-r-transparent animate-spin"
                        style={{ animationDuration: '4s' }}
                      />
                    </div>
                  )}

                  {/* Connection line - Hidden on mobile */}
                  {index < steps.length - 1 && (
                    <div className={`
                      absolute left-full top-1/2 w-2 sm:w-4 h-0.5 -translate-y-1/2
                      transition-all duration-700 hidden sm:block
                      ${activeStep >= index ? step.bgColor : 'bg-gray-300'}
                    `} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Main Content Area */}
          <div 
            className="relative min-h-[300px] sm:min-h-[400px] lg:min-h-[500px]"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`
                  absolute inset-0 transition-all duration-700 transform
                  ${activeStep === index 
                    ? 'opacity-100 translate-x-0' 
                    : index < activeStep 
                      ? 'opacity-0 -translate-x-full' 
                      : 'opacity-0 translate-x-full'
                  }
                `}
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-center">
                  {/* Left side - Content */}
                  <div className="space-y-4 sm:space-y-6">
                    <div className="flex items-center space-x-3 sm:space-x-4">
                      <div className={`flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full ${step.bgColor} shadow-lg flex-shrink-0`}>
                        <div className="scale-75 sm:scale-100">
                          {step.icon}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-xl sm:text-2xl font-bold ${step.color} leading-tight`}>
                          {step.title}
                        </h3>
                        <div className={`w-12 sm:w-16 h-1 ${step.bgColor} rounded-full mt-1 sm:mt-2`} />
                      </div>
                    </div>
                    
                    <p className="text-base sm:text-lg text-udaan-navy/80 leading-relaxed">
                      {step.description}
                    </p>

                    {/* Feature List */}
                    <div className="space-y-2 sm:space-y-3">
                      {step.details.map((detail, detailIndex) => (
                        <div
                          key={detailIndex}
                          className={`
                            flex items-start space-x-3 transform transition-all duration-500
                            ${activeStep === index 
                              ? 'translate-x-0 opacity-100' 
                              : 'translate-x-4 opacity-0'
                            }
                          `}
                          style={{
                            animationDelay: `${(detailIndex + 1) * 100}ms`
                          }}
                        >
                          <CheckCircle className={`h-4 w-4 sm:h-5 sm:w-5 ${step.color} flex-shrink-0 mt-0.5`} />
                          <span className="text-sm sm:text-base text-udaan-navy/70 leading-relaxed">{detail}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA Button */}
                    <div className="pt-3 sm:pt-4">
                      <Link href={step.route}>
                        <Button 
                          size="default"
                          className={`
                            ${step.bgColor} hover:opacity-90 text-white w-full sm:w-auto
                            transform transition-all duration-300 text-sm sm:text-base
                            ${activeStep === index ? 'scale-100 opacity-100' : 'scale-95 opacity-70'}
                          `}
                        >
                          Get Started with {step.title}
                          <ArrowRight className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Right side - Visual */}
                  <div className="relative mt-6 lg:mt-0">
                    <Link href={step.route} className="block">
                      <div className={`
                        relative bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8 shadow-xl
                        transform transition-all duration-700 cursor-pointer hover:shadow-2xl
                        hover:scale-[1.02] group
                        ${activeStep === index ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
                      `}>
                        {/* Decorative elements - Responsive */}
                        <div className={`absolute -top-2 -right-2 sm:-top-4 sm:-right-4 w-6 h-6 sm:w-8 sm:h-8 ${step.bgColor} rounded-full opacity-20`} />
                        <div className={`absolute -bottom-2 -left-2 sm:-bottom-4 sm:-left-4 w-4 h-4 sm:w-6 sm:h-6 ${step.bgColor} rounded-full opacity-30`} />
                        
                        {/* Click to explore hint */}
                        <div className="absolute top-2 right-2 sm:top-4 sm:right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className={`text-xs ${step.color} bg-white/90 px-2 py-1 rounded-full shadow-sm border`}>
                            Click to explore
                          </div>
                        </div>
                      
                      {/* Mock interface based on step */}
                      {step.id === 1 && (
                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium text-gray-500">Service Request</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Open</span>
                          </div>
                          <h4 className="font-semibold text-udaan-navy text-sm sm:text-base">Community Health Workshop</h4>
                          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Looking for healthcare professionals to conduct health awareness sessions...</p>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0 text-xs text-gray-500">
                            <span className="flex items-center"><Users className="h-3 w-3 mr-1" />5 volunteers needed</span>
                            <span className="flex items-center">📍 Mumbai</span>
                          </div>
                        </div>
                      )}

                      {step.id === 2 && (
                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium text-gray-500">Service Offer</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Available</span>
                          </div>
                          <h4 className="font-semibold text-udaan-navy text-sm sm:text-base">Digital Marketing Consultant</h4>
                          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Helping NGOs build their online presence and reach more beneficiaries...</p>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-2 sm:space-y-0 text-xs text-gray-500">
                            <span className="flex items-center">💼 2+ years experience</span>
                            <span className="flex items-center">⭐ 4.9 rating</span>
                          </div>
                        </div>
                      )}

                      {step.id === 3 && (
                        <div className="space-y-3 sm:space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs sm:text-sm font-medium text-gray-500">Marketplace Item</span>
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">For Sale</span>
                          </div>
                          <h4 className="font-semibold text-udaan-navy text-sm sm:text-base">Educational Books Bundle</h4>
                          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">Set of educational materials for rural schools. 50% of proceeds donated...</p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 flex items-center">📍 Delhi</span>
                            <span className="font-medium text-udaan-orange">₹500</span>
                          </div>
                        </div>
                      )}
                      </div>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Indicators - Mobile friendly */}
          <div className="flex flex-col items-center mt-6 sm:mt-8 space-y-3">
            <div className="flex justify-center space-x-2">
              {steps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleStepClick(index)}
                  className={`
                    w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all duration-300
                    ${activeStep === index 
                      ? steps[index].bgColor 
                      : 'bg-gray-300 hover:bg-gray-400'
                    }
                  `}
                />
              ))}
            </div>
            
            {/* Mobile swipe hint */}
            <div className="sm:hidden text-xs text-udaan-navy/60 text-center px-4">
              <span className="inline-flex items-center">
                ← Swipe to navigate →
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}