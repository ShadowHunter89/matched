import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  User,
  Plus,
  BarChart2,
  LogOut,
  Menu,
  X,
  Dot,
  Globe,
  Trophy,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Match } from '@/lib/types'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  badgeKey?: 'pendingMatches' | 'acceptedUnpaidMatches'
}

interface DashboardLayoutProps {
  children: React.ReactNode
  title?: string
}

const PROFESSIONAL_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/professional', icon: <LayoutDashboard size={18} />, badgeKey: 'pendingMatches' },
  { label: 'The Network', href: '/network', icon: <Globe size={18} /> },
  { label: 'Challenges', href: '/challenges', icon: <Trophy size={18} /> },
  { label: 'Edit Profile', href: '/profile', icon: <User size={18} /> },
]

const CLIENT_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard/client', icon: <LayoutDashboard size={18} />, badgeKey: 'acceptedUnpaidMatches' },
  { label: 'Post Opportunity', href: '/opportunities/new', icon: <Plus size={18} /> },
  { label: 'The Network', href: '/network', icon: <Globe size={18} /> },
  { label: 'Challenges', href: '/challenges', icon: <Trophy size={18} /> },
  { label: 'Analytics', href: '/analytics', icon: <BarChart2 size={18} /> },
]

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const location = useLocation()
  const { profile, user, signOut } = useAuthStore()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pendingMatches, setPendingMatches] = useState(0)
  const [acceptedUnpaidMatches, setAcceptedUnpaidMatches] = useState(0)

  const navItems = profile?.role === 'professional' ? PROFESSIONAL_NAV : CLIENT_NAV

  useEffect(() => {
    if (!user) return

    const fetchCounts = async () => {
      if (profile?.role === 'professional') {
        const { count } = await supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('professional_id', user.id)
          .eq('status', 'pending')
        setPendingMatches(count ?? 0)
      } else if (profile?.role === 'client') {
        const { data: clientOpps } = await supabase
          .from('opportunities')
          .select('id')
          .eq('client_id', user.id)
        const oppIds = (clientOpps || []).map((o) => o.id)
        if (oppIds.length > 0) {
          const { count } = await supabase
            .from('matches')
            .select('*', { count: 'exact', head: true })
            .in('opportunity_id', oppIds)
            .eq('status', 'accepted')
            .eq('payment_status', 'unpaid')
          setAcceptedUnpaidMatches(count ?? 0)
        } else {
          setAcceptedUnpaidMatches(0)
        }
      }
    }

    fetchCounts()

    // Realtime subscription
    const channel = supabase
      .channel('matches-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => { fetchCounts() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, profile?.role])

  const getBadgeCount = (key?: NavItem['badgeKey']): number => {
    if (!key) return 0
    if (key === 'pendingMatches') return pendingMatches
    if (key === 'acceptedUnpaidMatches') return acceptedUnpaidMatches
    return 0
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-[#2a2a2a]">
        <Link to="/" className="flex items-center gap-1.5 group">
          <span className="text-xl font-bold text-white tracking-tight">Matched</span>
          <Dot className="text-[#E8FF47] -ml-1" size={24} />
        </Link>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href
          const badgeCount = getBadgeCount(item.badgeKey)

          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-[#1a1a1a] text-white border-l-2 border-[#E8FF47] pl-[10px]'
                  : 'text-[#888888] hover:text-white hover:bg-[#141414]'
              }`}
            >
              <span className={isActive ? 'text-[#E8FF47]' : 'text-current'}>{item.icon}</span>
              <span>{item.label}</span>
              {badgeCount > 0 && (
                <span className="ml-auto flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#E8FF47] text-black text-xs font-bold">
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-[#2a2a2a] space-y-3">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-white truncate">{profile?.full_name ?? 'Anonymous'}</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${
            profile?.role === 'professional'
              ? 'bg-[#E8FF47]/10 text-[#E8FF47] border border-[#E8FF47]/20'
              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          }`}>
            {profile?.role === 'professional' ? 'Professional' : 'Client'}
          </span>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-[#888888] hover:text-red-400 hover:bg-red-500/5 transition-all duration-150"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0C0C0C] flex font-sans">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-[#0C0C0C] border-r border-[#2a2a2a] fixed top-0 left-0 h-screen z-30">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed top-0 left-0 h-screen w-60 bg-[#0C0C0C] border-r border-[#2a2a2a] z-50 transform transition-transform duration-300 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-[#888888] hover:text-white hover:bg-[#1a1a1a] transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-4 border-b border-[#2a2a2a] bg-[#0C0C0C] sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-[#888888] hover:text-white hover:bg-[#1a1a1a] transition-colors"
          >
            <Menu size={20} />
          </button>
          {title && <h1 className="text-sm font-semibold text-white">{title}</h1>}
          <Link to="/" className="flex items-center gap-0.5">
            <span className="text-base font-bold text-white">Matched</span>
            <Dot className="text-[#E8FF47] -ml-1" size={20} />
          </Link>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
