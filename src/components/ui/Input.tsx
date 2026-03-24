import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-white">
          {label}
        </label>
      )}
      <input
        className={`w-full bg-[#141414] border ${error ? 'border-red-500/50' : 'border-[#2a2a2a]'} text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors focus:border-[#E8FF47]/50 placeholder:text-[#888888] ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
      {hint && !error && <span className="text-xs text-[#888888]">{hint}</span>}
    </div>
  )
}

export default Input
