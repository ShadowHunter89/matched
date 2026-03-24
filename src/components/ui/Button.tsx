import React from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none'

  const variants = {
    primary: 'bg-[#E8FF47] text-black hover:bg-[#d4eb3e] active:scale-95',
    secondary: 'bg-transparent border border-[#2a2a2a] text-white hover:border-[#4a4a4a] hover:bg-[#1a1a1a] active:scale-95',
    ghost: 'bg-transparent text-[#888888] hover:text-white hover:bg-[#1a1a1a] active:scale-95',
    danger: 'bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 active:scale-95',
  }

  const sizes = {
    sm: 'text-xs px-4 py-2',
    md: 'text-sm px-6 py-3',
    lg: 'text-base px-8 py-4',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 12 : size === 'lg' ? 18 : 14} />}
      {children}
    </button>
  )
}

export default Button
