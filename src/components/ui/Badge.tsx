import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'outline'
  className?: string
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-[#1e1e1e] text-white border border-[#2a2a2a]',
    accent: 'bg-[#E8FF47] text-black font-semibold',
    success: 'bg-[#A8FF3E]/10 text-[#A8FF3E] border border-[#A8FF3E]/20',
    warning: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    danger: 'bg-red-500/10 text-red-400 border border-red-500/20',
    muted: 'bg-[#1a1a1a] text-[#888888]',
    outline: 'bg-transparent border border-[#2a2a2a] text-[#888888]',
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

export default Badge
