"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Logo, LogoIcon } from "@/components/ui/Logo"
import {
  RiSendPlaneFill,
  RiCheckLine,
  RiArrowRightLine,
  RiToolsLine,
  RiTempColdLine,
  RiFlashlightLine,
  RiHome4Line,
  RiPlantLine,
  RiBrush2Line,
  RiSettings3Line,
  RiBugLine,
  RiBuilding2Line,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"

type MessageType = "bot" | "user" | "options" | "input" | "complete"

interface Message {
  id: string
  type: MessageType
  content: string
  options?: { id: string; label: string; icon?: React.ComponentType<{ className?: string }> }[]
  inputType?: "text" | "tel"
  inputPlaceholder?: string
  field?: string
}

interface OnboardingData {
  trade: string
  businessName: string
  ownerName: string
  monthlyQuotes: string
  phone: string
}

const TRADE_OPTIONS = [
  { id: "plumbing", label: "Plumbing", icon: RiToolsLine },
  { id: "hvac", label: "HVAC", icon: RiTempColdLine },
  { id: "electrical", label: "Electrical", icon: RiFlashlightLine },
  { id: "cleaning", label: "Cleaning", icon: RiHome4Line },
  { id: "landscaping", label: "Landscaping", icon: RiPlantLine },
  { id: "painting", label: "Painting", icon: RiBrush2Line },
  { id: "handyman", label: "Handyman", icon: RiSettings3Line },
  { id: "pest_control", label: "Pest Control", icon: RiBugLine },
  { id: "other", label: "Other", icon: RiBuilding2Line },
]

const QUOTE_OPTIONS = [
  { id: "1-10", label: "1-10 quotes/month" },
  { id: "11-25", label: "11-25 quotes/month" },
  { id: "26-50", label: "26-50 quotes/month" },
  { id: "50+", label: "50+ quotes/month" },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [data, setData] = useState<OnboardingData>({
    trade: "",
    businessName: "",
    ownerName: "",
    monthlyQuotes: "",
    phone: "",
  })
  const [inputValue, setInputValue] = useState("")
  const [currentStep, setCurrentStep] = useState(0)
  const [isTyping, setIsTyping] = useState(false)
  const [, setIsComplete] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Start conversation
  useEffect(() => {
    const timer = setTimeout(() => {
      addBotMessage("Hey! 👋 I'm here to help you set up Vistrial in just a couple minutes.")
      setTimeout(() => {
        addBotMessage("What type of service business do you run?")
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            type: "options",
            content: "",
            options: TRADE_OPTIONS,
            field: "trade"
          }])
        }, 500)
      }, 1000)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const addBotMessage = (content: string) => {
    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: "bot",
        content
      }])
    }, 600)
  }

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      type: "user",
      content
    }])
  }

  const handleOptionSelect = (field: string, value: string, label: string) => {
    addUserMessage(label)
    setData(prev => ({ ...prev, [field]: value }))

    // Progress conversation based on field
    if (field === "trade") {
      setTimeout(() => {
        addBotMessage(`Great choice! ${label} is a solid industry. 💪`)
        setTimeout(() => {
          addBotMessage("What's your business name?")
          setTimeout(() => {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              type: "input",
              content: "",
              inputType: "text",
              inputPlaceholder: "e.g., Pro Plumbing LLC",
              field: "businessName"
            }])
            setCurrentStep(1)
          }, 500)
        }, 800)
      }, 400)
    } else if (field === "monthlyQuotes") {
      setTimeout(() => {
        const quoteMsg = value === "50+" 
          ? "Wow, that's a lot of quotes! You're definitely leaving money on the table without proper follow-up."
          : "Got it. Even a few missed follow-ups can cost you thousands."
        addBotMessage(quoteMsg)
        setTimeout(() => {
          addBotMessage("Last thing - what's the best phone number to reach you?")
          setTimeout(() => {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              type: "input",
              content: "",
              inputType: "tel",
              inputPlaceholder: "(555) 123-4567",
              field: "phone"
            }])
            setCurrentStep(4)
          }, 500)
        }, 800)
      }, 400)
    }
  }

  const handleInputSubmit = (field: string) => {
    if (!inputValue.trim()) return
    
    addUserMessage(inputValue)
    setData(prev => ({ ...prev, [field]: inputValue }))
    setInputValue("")

    if (field === "businessName") {
      setTimeout(() => {
        addBotMessage(`Nice to meet you, ${inputValue}! 🎉`)
        setTimeout(() => {
          addBotMessage("And what's your name? (This helps personalize your messages)")
          setTimeout(() => {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              type: "input",
              content: "",
              inputType: "text",
              inputPlaceholder: "e.g., Mike, Sarah",
              field: "ownerName"
            }])
            setCurrentStep(2)
          }, 500)
        }, 800)
      }, 400)
    } else if (field === "ownerName") {
      setTimeout(() => {
        addBotMessage(`Hey ${inputValue}! Almost done. 🚀`)
        setTimeout(() => {
          addBotMessage("About how many quotes do you send out per month?")
          setTimeout(() => {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              type: "options",
              content: "",
              options: QUOTE_OPTIONS,
              field: "monthlyQuotes"
            }])
            setCurrentStep(3)
          }, 500)
        }, 800)
      }, 400)
    } else if (field === "phone") {
      // Complete onboarding
      setTimeout(() => {
        addBotMessage("Perfect! You're all set. 🎊")
        setTimeout(() => {
          addBotMessage("I've created your account. Let's get your first follow-up sequence set up!")
          setTimeout(() => {
            setIsComplete(true)
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              type: "complete",
              content: ""
            }])
          }, 800)
        }, 800)
      }, 400)
    }
  }

  const handleComplete = async () => {
    try {
      await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
    } catch {
      // Continue anyway
    }
    router.push("/dashboard")
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Logo size="sm" variant="dark" showText={true} />
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  step <= currentStep
                    ? "w-8 bg-gradient-to-r from-brand-500 to-brand-600"
                    : "w-2 bg-gray-200"
                )}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Chat container */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="animate-fade-in">
                {message.type === "bot" && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <LogoIcon size={32} />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3 max-w-[80%]">
                      <p className="text-gray-900">{message.content}</p>
                    </div>
                  </div>
                )}

                {message.type === "user" && (
                  <div className="flex justify-end">
                    <div className="bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%] shadow-lg shadow-brand-500/20">
                      <p>{message.content}</p>
                    </div>
                  </div>
                )}

                {message.type === "options" && message.options && (
                  <div className="flex gap-3">
                    <div className="w-8 flex-shrink-0" />
                    <div className="flex flex-wrap gap-2">
                      {message.options.map((option) => (
                        <button
                          key={option.id}
                          onClick={() => handleOptionSelect(message.field!, option.id, option.label)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {option.icon && <option.icon className="w-4 h-4 text-gray-500" />}
                          <span className="text-gray-700 font-medium">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {message.type === "input" && (
                  <div className="flex gap-3">
                    <div className="w-8 flex-shrink-0" />
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleInputSubmit(message.field!)
                      }}
                      className="flex-1 flex gap-2"
                    >
                      <input
                        ref={inputRef}
                        type={message.inputType}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={message.inputPlaceholder}
                        autoFocus
                        className="flex-1 px-4 py-3 bg-white border-2 border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={!inputValue.trim()}
                        className="px-4 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl hover:from-brand-600 hover:to-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25"
                      >
                        <RiSendPlaneFill className="w-5 h-5" />
                      </button>
                    </form>
                  </div>
                )}

                {message.type === "complete" && (
                  <div className="flex gap-3">
                    <div className="w-8 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="bg-gradient-to-r from-brand-50 to-indigo-50 border border-brand-200 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                            <RiCheckLine className="w-6 h-6 text-green-600" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">You&apos;re all set!</h3>
                            <p className="text-sm text-gray-500">Account created successfully</p>
                          </div>
                        </div>
                        
                        <div className="bg-white rounded-xl p-4 space-y-2 border border-gray-100">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Business</span>
                            <span className="font-medium text-gray-900">{data.businessName}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Industry</span>
                            <span className="font-medium text-gray-900">{TRADE_OPTIONS.find(t => t.id === data.trade)?.label}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Contact</span>
                            <span className="font-medium text-gray-900">{data.ownerName}</span>
                          </div>
                        </div>

                        <button
                          onClick={handleComplete}
                          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-semibold hover:from-brand-600 hover:to-brand-700 transition-all shadow-lg shadow-brand-500/25 hover:scale-[1.01]"
                        >
                          Go to Dashboard
                          <RiArrowRightLine className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <LogoIcon size={32} />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-4">
        <div className="max-w-2xl mx-auto px-4">
          <p className="text-center text-xs text-gray-400">
            Powered by Vistrial · Your data is secure
          </p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
