"use client"

/**
 * Vistrial Landing Page
 * Modern marketing page with animated sections
 */

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  RiCheckLine,
  RiArrowRightLine,
  RiPlayLine,
  RiShieldCheckLine,
  RiLockLine,
  RiSparklingLine,
  RiMenuLine,
  RiCloseLine,
  RiSendPlaneLine,
  RiMessage2Line,
  RiMailLine,
  RiAlarmWarningLine,
  RiHeartLine,
  RiStarLine,
  RiLoader4Line,
  RiUserLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils/cn"

// ============================================================================
// HERO SECTION
// ============================================================================

function HeroSection() {
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !fullName) return
    
    setIsSubmitting(true)
    await new Promise(r => setTimeout(r, 1500))
    setIsSubmitting(false)
    setSubmitted(true)
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        {/* Subtle grid */}
        <div 
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgb(229 231 235) 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
        
        {/* Gradient blobs */}
        <div className="absolute top-20 -left-32 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-20 -right-32 w-[500px] h-[500px] bg-brand-400/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-brand-500/5 to-brand-400/5 rounded-full blur-[80px]" />
      </div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Content */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-100 border border-brand-200 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
              </span>
              <span className="text-sm font-medium text-brand-700">Smart booking automation</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.1] mb-6">
              Book more jobs.
              <br />
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600 bg-clip-text text-transparent">
                Automatically.
              </span>
            </h1>
            
            <p className="text-lg text-gray-600 max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              Stop losing leads to slow follow-ups. Vistrial automates your bookings, 
              converts one-time customers into recurring members, and grows your revenue—all on autopilot.
            </p>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              {[
                { value: '2x', label: 'More bookings' },
                { value: '10h+', label: 'Saved weekly' },
                { value: '30%', label: 'Revenue growth' },
              ].map((stat, i) => (
                <div key={i} className="text-center lg:text-left">
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>
            
            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6">
              <div className="flex items-center gap-2 text-gray-500">
                <RiShieldCheckLine className="w-4 h-4 text-green-500" />
                <span className="text-sm">Secure & reliable</span>
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <RiLockLine className="w-4 h-4 text-green-500" />
                <span className="text-sm">Bank-level encryption</span>
              </div>
            </div>
          </div>
          
          {/* Right - Form */}
          <div>
            <div className="relative">
              {/* Card shadow/glow */}
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-500/20 via-brand-400/20 to-brand-500/20 rounded-3xl blur-xl" />
              
              <div className="relative bg-white border border-gray-200 rounded-2xl p-8 shadow-2xl shadow-gray-200/50">
                {!submitted ? (
                  <div>
                    <div className="text-center mb-8">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Start your free trial</h2>
                      <p className="text-gray-500">No credit card required. Get started in 2 minutes.</p>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                        <div className="relative">
                          <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="John Smith"
                            className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                            required
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Work Email</label>
                        <div className="relative">
                          <RiMailLine className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="john@company.com"
                            className="w-full h-12 pl-11 pr-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                            required
                          />
                        </div>
                      </div>
                      
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="group relative w-full h-12 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-medium rounded-xl shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <RiLoader4Line className="w-5 h-5 animate-spin" />
                            Creating account...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            Get Started Free
                            <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                          </span>
                        )}
                      </button>
                    </form>
                    
                    <p className="text-center text-xs text-gray-500 mt-6">
                      By signing up, you agree to our{' '}
                      <Link href="/terms" className="text-brand-600 hover:underline">Terms</Link> and{' '}
                      <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <RiCheckLine className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">You&apos;re in!</h3>
                    <p className="text-gray-500 mb-6">Check your email to complete setup.</p>
                    <Link href="/signup">
                      <button className="relative bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none">
                        Continue to Dashboard
                      </button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2 text-gray-400 animate-bounce">
          <span className="text-xs uppercase tracking-wider">Scroll to explore</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// FEATURE DEMOS
// ============================================================================

function BookingDemo() {
  const [step, setStep] = useState(0)
  const steps = ['Service', 'Details', 'Time', 'Book']
  
  useEffect(() => {
    const timer = setInterval(() => {
      setStep(prev => (prev + 1) % 4)
    }, 2500)
    return () => clearInterval(timer)
  }, [])
  
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
      {/* Widget Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-brand-500 to-brand-600 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center font-bold">
            SC
          </div>
          <div>
            <p className="font-semibold">Sparkle Clean Co.</p>
            <p className="text-xs text-white/80">(555) 123-4567</p>
          </div>
        </div>
      </div>
      
      {/* Promo Banner */}
      <div className="px-6 py-3 bg-green-50 text-center">
        <p className="text-green-700 font-semibold text-sm">🎉 Get 20% Off Your First Clean!</p>
      </div>
      
      {/* Step Indicator */}
      <div className="px-6 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          {steps.map((_, i) => (
            <div key={i} className="flex items-center">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                i <= step ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"
              )}>
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  "w-8 h-0.5 mx-1 transition-all",
                  i < step ? "bg-brand-600" : "bg-gray-200"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6 min-h-[200px]">
        {step === 0 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Select Service</h4>
            <div className="grid grid-cols-2 gap-2">
              {['Standard Clean', 'Deep Clean', 'Move-Out', 'Recurring'].map((service, i) => (
                <div key={i} className={cn(
                  "p-3 border rounded-lg text-center cursor-pointer transition-all",
                  i === 1 ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-brand-300"
                )}>
                  <p className="font-medium text-sm">{service}</p>
                  <p className="text-brand-600 font-bold">${149 + (i * 50)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Property Details</h4>
            <div className="space-y-3">
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Bedrooms</span>
                <span className="font-medium">3</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Bathrooms</span>
                <span className="font-medium">2</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Sq Ft</span>
                <span className="font-medium">1,800</span>
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">Pick a Time</h4>
            <div className="grid grid-cols-3 gap-2">
              {['9:00 AM', '11:00 AM', '1:00 PM', '3:00 PM', '5:00 PM'].map((time, i) => (
                <div key={i} className={cn(
                  "p-2 border rounded-lg text-center text-sm cursor-pointer transition-all",
                  i === 1 ? "border-brand-500 bg-brand-50 text-brand-700 font-medium" : "border-gray-200"
                )}>
                  {time}
                </div>
              ))}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <RiCheckLine className="w-6 h-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-gray-900 mb-1">Ready to Book!</h4>
            <p className="text-sm text-gray-500 mb-4">Secure checkout with Stripe</p>
            <div className="p-3 bg-gray-50 rounded-lg text-sm">
              <div className="flex justify-between mb-1">
                <span>Deep Clean</span>
                <span>$199</span>
              </div>
              <div className="flex justify-between text-green-600">
                <span>First-time Discount</span>
                <span>-$40</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-brand-600">$159</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function QuoteFollowUpDemo() {
  const [activeStep, setActiveStep] = useState(2)
  
  const sequence = [
    { day: 0, action: 'Quote sent', status: 'completed', icon: RiSendPlaneLine },
    { day: 2, action: 'First follow-up', status: 'completed', icon: RiMessage2Line },
    { day: 5, action: 'Value email', status: 'active', icon: RiMailLine },
    { day: 8, action: 'Urgency SMS', status: 'pending', icon: RiAlarmWarningLine },
    { day: 12, action: 'Final touch', status: 'pending', icon: RiCheckLine },
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-gray-900">Quote Follow-Up Sequence</h4>
          <p className="text-sm text-gray-500">21-day nurture automation</p>
        </div>
        <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
          Active
        </div>
      </div>
      
      <div className="p-6">
        <div className="relative">
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
          
          <div className="space-y-6">
            {sequence.map((step, i) => (
              <div
                key={i}
                className={cn(
                  "relative flex items-start gap-4 cursor-pointer transition-all",
                  activeStep === i && "scale-[1.02]"
                )}
                onClick={() => setActiveStep(i)}
              >
                <div className={cn(
                  "relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all",
                  step.status === 'completed' && "bg-green-500 text-white",
                  step.status === 'active' && "bg-brand-600 text-white ring-4 ring-brand-100",
                  step.status === 'pending' && "bg-gray-200 text-gray-500"
                )}>
                  <step.icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 pt-2">
                  <div className="flex items-center justify-between">
                    <p className={cn(
                      "font-medium",
                      step.status === 'active' ? 'text-brand-600' : 'text-gray-900'
                    )}>
                      {step.action}
                    </p>
                    <span className="text-xs text-gray-400">Day {step.day}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-100 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">35%</p>
            <p className="text-xs text-gray-500">Close Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">21</p>
            <p className="text-xs text-gray-500">Avg Days</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">6</p>
            <p className="text-xs text-gray-500">Touch Points</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeaturesSection() {
  const features = [
    {
      title: 'Online Booking Widget',
      description: 'Let customers book appointments 24/7 from your website with real-time pricing and secure Stripe payments.',
      demo: <BookingDemo />,
    },
    {
      title: 'Smart Quote Follow-Up',
      description: 'Automated 21-day nurture sequences that convert estimates to booked jobs. Never lose a lead again.',
      demo: <QuoteFollowUpDemo />,
    },
  ]

  return (
    <section id="features" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-100 text-brand-700 text-sm font-medium rounded-full mb-4">
            <RiSparklingLine className="w-4 h-4" />
            Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Everything you need to win more jobs
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Powerful automation tools designed specifically for home service businesses. 
            Set it up once, then watch your close rate soar.
          </p>
        </div>
        
        <div className="space-y-24">
          {features.map((feature, i) => (
            <div
              key={i}
              className={cn(
                "grid lg:grid-cols-2 gap-12 items-center",
                i % 2 === 1 && "lg:flex-row-reverse"
              )}
            >
              <div className={cn(i % 2 === 1 && "lg:order-2")}>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                <p className="text-gray-600 mb-6">{feature.description}</p>
                <Link href="/signup">
                  <button className="group relative bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-6 py-3 rounded-xl font-medium shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none">
                    Learn More
                    <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </Link>
              </div>
              <div className={cn(i % 2 === 1 && "lg:order-1")}>
                {feature.demo}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// TESTIMONIALS
// ============================================================================

const testimonials = [
  {
    quote: "Vistrial helped us close 40% more quotes in our first month. The automated follow-ups are so good, customers think they're talking to me!",
    author: 'Sarah Chen',
    role: 'Owner, Sparkle Clean Co.',
    avatar: 'SC',
  },
  {
    quote: "We went from a 2-day response time to under 5 minutes. Our conversion rate doubled and we're booking jobs we would have lost.",
    author: 'Mike Johnson',
    role: 'Operations Manager, Johnson HVAC',
    avatar: 'MJ',
  },
  {
    quote: "The recurring membership feature alone is worth it. Our monthly revenue is now predictable and growing every month.",
    author: 'David Rodriguez',
    role: 'Owner, Fresh Start Cleaning',
    avatar: 'DR',
  },
]

function TestimonialsSection() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand-100 text-brand-700 text-sm font-medium rounded-full mb-4">
            <RiHeartLine className="w-4 h-4" />
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Loved by home service pros
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Join hundreds of contractors who are winning more jobs with Vistrial.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-2xl p-6 shadow-lg shadow-gray-100 hover:shadow-xl transition-shadow"
            >
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => (
                  <RiStarLine key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
              
              <p className="text-gray-600 mb-6 leading-relaxed">&quot;{testimonial.quote}&quot;</p>
              
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white text-sm font-semibold">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="text-gray-900 font-medium">{testimonial.author}</p>
                  <p className="text-gray-500 text-sm">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// CTA SECTION
// ============================================================================

function CTASection() {
  return (
    <section id="pricing" className="py-24">
      <div className="max-w-4xl mx-auto px-6">
        <div className="relative">
          {/* Glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-brand-500/20 via-brand-400/20 to-brand-500/20 rounded-3xl blur-2xl" />
          
          <div className="relative bg-gradient-to-br from-brand-500 to-brand-600 rounded-3xl p-12 text-center overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 1px)`,
                backgroundSize: '32px 32px',
              }} />
            </div>
            
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to win more jobs?
              </h2>
              <p className="text-white/80 max-w-xl mx-auto mb-8">
                Join 500+ home service businesses already using Vistrial to close more deals 
                and grow their revenue.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/signup">
                  <button className="group relative bg-white text-brand-700 px-8 py-4 rounded-xl font-semibold shadow-lg hover:bg-gray-50 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/80 before:border-b-gray-100 before:border-r-gray-100 before:pointer-events-none">
                    Start Free Trial
                    <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </Link>
                <a href="#demo">
                  <button className="relative border-2 border-white/30 text-white px-8 py-4 rounded-xl font-medium hover:bg-white/10 transition-all flex items-center gap-2 before:absolute before:inset-[1px] before:rounded-[9px] before:border before:border-white/10 before:border-b-transparent before:border-r-transparent before:pointer-events-none">
                    <RiPlayLine className="w-4 h-4" />
                    Watch Demo
                  </button>
                </a>
              </div>
              
              <p className="text-white/60 text-sm mt-6">
                No credit card required • 14-day free trial • Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================================
// NAVIGATION & FOOTER
// ============================================================================

function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/VISTRIAL.png"
            alt="Vistrial"
            width={120}
            height={40}
            className="object-contain"
          />
        </Link>
        
        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</a>
          <a href="#demo" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Demo</a>
          <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden sm:block text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
            Log in
          </Link>
          <Link href="/signup">
            <button className="group relative bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] before:absolute before:inset-[1px] before:rounded-[10px] before:border before:border-white/20 before:border-b-transparent before:border-r-transparent before:pointer-events-none">
              Get Started
              <RiArrowRightLine className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </Link>
          
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
          >
            {mobileMenuOpen ? <RiCloseLine className="w-5 h-5" /> : <RiMenuLine className="w-5 h-5" />}
          </button>
        </div>
      </div>
      
      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-3">
          <a href="#features" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#demo" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Demo</a>
          <a href="#pricing" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
          <Link href="/login" className="block text-sm text-gray-600 py-2" onClick={() => setMobileMenuOpen(false)}>Log in</Link>
        </div>
      )}
    </nav>
  )
}

function Footer() {
  return (
    <footer className="py-12 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Image
              src="/VISTRIAL.png"
              alt="Vistrial"
              width={100}
              height={32}
              className="object-contain"
            />
          </div>
          <div className="flex items-center gap-8 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-gray-700 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-700 transition-colors">Terms</Link>
            <a href="mailto:support@vistrial.com" className="hover:text-gray-700 transition-colors">Support</a>
          </div>
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Vistrial. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <HeroSection />
      <FeaturesSection />
      <TestimonialsSection />
      <CTASection />
      <Footer />
    </div>
  )
}
