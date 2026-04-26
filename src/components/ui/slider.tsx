import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SliderProps {
  min: number
  max: number
  step?: number
  value: number
  onValueChange: (value: number) => void
  className?: string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ min, max, step = 1, value, onValueChange, className }, ref) => (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onValueChange(Number(e.target.value))}
      className={cn(
        'w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600',
        className
      )}
    />
  )
)
Slider.displayName = 'Slider'

export { Slider }
