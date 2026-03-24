import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const [professionalCount, setProfessionalCount] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'Matched — Where Work Finds You'
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from('professional_profiles')
        .select('*', { count: 'exact', head: true })
      if (count !== null) setProfessionalCount(count)
    }
    fetchCount()
  }, [])

  return (
    <div className="min-h-screen bg-[#0C0C0C] text-white font-sans">
      {/* Navbar */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'border-b border-[#2a2a2a] bg-[#0C0C0C]/90 backdrop-blur-xl' : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-1">
            <span className="text-lg font-bold text-white tracking-tight">Matched</span>
            <span className="w-2 h-2 rounded-full bg-[#E8FF47] mb-3 -ml-0.5" />
          </Link>

          {/* Center links */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href="#how-it-works"
              className="text-sm text-[#888888] hover:text-white transition-colors"
            >
              How it works
            </a>
            <a
              href="#for-clients"
              className="text-sm text-[#888888] hover:text-white transition-colors"
            >
              For clients
            </a>
          </div>

          {/* CTA */}
          <Link to="/auth">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
        {/* Background texture — dot grid */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(circle, #ffffff 1px, transparent 1px)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Subtle radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[#E8FF47]/5 blur-[120px] pointer-events-none" />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Live count pill */}
          {professionalCount !== null && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#2a2a2a] bg-[#141414] text-sm text-[#888888] mb-8">
              <span className="w-2 h-2 rounded-full bg-[#A8FF3E] animate-pulse" />
              {professionalCount.toLocaleString()} professionals available
            </div>
          )}

          {/* Main headline */}
          <h1 className="text-7xl md:text-[88px] font-bold leading-[1.05] tracking-tight mb-6">
            <span className="block text-white">Work finds you.</span>
            <span className="block text-[#E8FF47]">Not the other way.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-[#888888] max-w-2xl mx-auto mb-10 leading-relaxed">
            Matched delivers the top 3–5 professionals to every opportunity. No public job board. No applying. No searching.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth?tab=signup&role=professional">
              <Button variant="secondary" size="lg">
                Join as a professional
              </Button>
            </Link>
            <Link to="/auth?tab=signup&role=client">
              <Button size="lg">
                Post an opportunity
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              Simple by design.
            </h2>
            <p className="text-[#888888] mt-3 text-lg">Three steps. Zero noise.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                number: '01',
                title: 'Post an opportunity',
                description:
                  'Describe what you need in plain language. Skills, timeline, budget, remote preference.',
              },
              {
                number: '02',
                title: 'We find your matches',
                description:
                  'Our AI analyzes the entire professional pool and selects the top 3–5 fits. No noise.',
              },
              {
                number: '03',
                title: 'They come to you',
                description:
                  'Matched professionals receive your opportunity directly. No job boards. No applications.',
              },
            ].map((step) => (
              <div
                key={step.number}
                className="bg-[#141414] border border-[#2a2a2a] rounded-2xl p-8 hover:border-[#3a3a3a] transition-colors duration-200 group"
              >
                <span className="text-4xl font-bold text-[#E8FF47] opacity-70 group-hover:opacity-100 transition-opacity">
                  {step.number}
                </span>
                <h3 className="text-xl font-semibold text-white mt-4 mb-3">{step.title}</h3>
                <p className="text-[#888888] leading-relaxed text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Row */}
      <section id="for-clients" className="py-20 px-6 border-y border-[#2a2a2a]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { value: '94%', label: 'Match acceptance' },
              { value: '<2hrs', label: 'Average time to match' },
              { value: 'Top 5', label: 'Professionals per opportunity' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl md:text-6xl font-bold text-[#E8FF47] tracking-tight mb-2">
                  {stat.value}
                </div>
                <div className="text-[#888888] text-sm font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            <span className="text-base font-bold text-white">Matched</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8FF47] mb-3 -ml-0.5" />
          </div>
          <p className="text-sm text-[#888888]">
            &copy; 2025 Matched. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
