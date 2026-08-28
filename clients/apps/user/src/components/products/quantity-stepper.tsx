import { Minus, Plus } from "lucide-react"

type QuantityStepperProps = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** "default" = detail-page sized cells, "compact" = card/sheet footer cells. */
  size?: "default" | "compact"
  /** Spread −/qty/+ across the full width (sheet cells); default hugs inline. */
  spread?: boolean
  increaseLabel: string
  decreaseLabel: string
}

/**
 * Changes propagate only through onChange — the buttons swallow their click
 * events so steppers nested inside links (product cards) never navigate.
 */
function stepOnClick(event: React.MouseEvent, value: number) {
  event.preventDefault()
  event.stopPropagation()
  return value
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  size = "default",
  spread = false,
  increaseLabel,
  decreaseLabel,
}: QuantityStepperProps) {
  const compact = size === "compact"
  const cell = compact ? "h-8 w-8" : "h-11 w-11"
  const icon = compact ? "h-3.5 w-3.5" : "h-4 w-4"

  return (
    <div
      className={`${
        spread
          ? "flex w-full items-center justify-between"
          : "inline-flex items-center"
      } border border-black/15`}
    >
      <button
        type="button"
        onClick={(event) =>
          onChange(stepOnClick(event, Math.max(min, value - 1)))
        }
        disabled={value <= min}
        className={`flex ${cell} items-center justify-center transition-colors hover:bg-secondary disabled:opacity-40`}
        aria-label={decreaseLabel}
      >
        <Minus className={icon} />
      </button>
      <span
        className={`flex ${cell} items-center justify-center ${
          compact ? "text-sm font-medium" : "text-base font-medium"
        }${spread ? "" : " border-x border-black/15"}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={(event) =>
          onChange(stepOnClick(event, Math.min(max, value + 1)))
        }
        disabled={value >= max}
        className={`flex ${cell} items-center justify-center transition-colors hover:bg-secondary disabled:opacity-40`}
        aria-label={increaseLabel}
      >
        <Plus className={icon} />
      </button>
    </div>
  )
}
