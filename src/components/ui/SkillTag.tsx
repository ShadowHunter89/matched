import React from 'react'
import { X } from 'lucide-react'

interface SkillTagProps {
  skill: string
  onRemove?: () => void
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'md'
}

export function SkillTag({ skill, onRemove, onClick, selected, size = 'md' }: SkillTagProps) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border transition-all ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1.5 text-sm'
      } ${
        selected
          ? 'bg-[#E8FF47]/10 border-[#E8FF47]/50 text-[#E8FF47]'
          : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#888888] hover:border-[#3a3a3a] hover:text-white'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {skill}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-current opacity-60 hover:opacity-100 transition-opacity"
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}

export default SkillTag
