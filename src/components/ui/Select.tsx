import React from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, error, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-white">{label}</label>}
      <div className="relative">
        <select
          className={`w-full bg-[#141414] border ${error ? 'border-red-500/50' : 'border-[#2a2a2a]'} text-white rounded-xl px-4 py-3 text-sm outline-none transition-colors focus:border-[#E8FF47]/50 appearance-none pr-10 ${props.value === '' ? 'text-[#888888]' : 'text-white'} ${className}`}
          {...props}
        >
          {placeholder && <option value="" className="text-[#888888] bg-[#141414]">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value} className="bg-[#141414] text-white">{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none" size={16} />
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}

export default Select
