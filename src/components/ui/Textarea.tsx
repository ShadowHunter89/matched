import React from 'react'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export function Textarea({ label, error, hint, className = '', ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white">{label}</label>}
      <textarea
        className={`w-full bg-[#141414] border ${error ? 'border-red-500/50' : 'border-[#2a2a2a]'} text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors focus:border-[#E8FF47]/50 placeholder:text-[#888888] resize-none ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
      {hint && !error && <span className="text-xs text-[#888888]">{hint}</span>}
    </div>
  )
}

export default Textarea
