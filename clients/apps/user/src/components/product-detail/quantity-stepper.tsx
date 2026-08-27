import { Minus, Plus } from "lucide-react"

type QuantityStepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  increaseLabel: string
  decreaseLabel: string
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  increaseLabel,
  decreaseLabel,
}: QuantityStepperProps) {
  return (
    <div className="inline-flex items-center border border-black/15">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-11 w-11 items-center justify-center transition-colors hover:bg-secondary disabled:opacity-40"
        aria-label={decreaseLabel}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="flex h-11 w-11 items-center justify-center border-x border-black/15 text-base font-medium">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-11 w-11 items-center justify-center transition-colors hover:bg-secondary disabled:opacity-40"
        aria-label={increaseLabel}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
