import { useState } from "react";
import { format } from "date-fns";
import { ChevronDownIcon } from "lucide-react";

import { Button } from "@aarogyaruchi/ui/components/button";
import { Calendar } from "@aarogyaruchi/ui/components/calendar";
import { Input } from "@aarogyaruchi/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aarogyaruchi/ui/components/popover";

/**
 * Date + time-of-day picker for dashboard range filters: a calendar
 * popover for the day, a time input for the clock, combined into one
 * controlled Date. Picking a new day keeps the already-chosen time
 * (midnight until the time input is touched).
 *
 * Plain label/wrapper markup instead of registry Field components on
 * purpose: Field's `* :w-full` child rule fights fixed widths on the
 * nested trigger/input, collapsing the control widths.
 */
export function DateTimePicker({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: Date | undefined;
  onChange: (value: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const handleDate = (date: Date | undefined) => {
    if (!date) {
      onChange(undefined);
      return;
    }
    const next = new Date(date);
    if (value) {
      next.setHours(value.getHours(), value.getMinutes(), value.getSeconds());
    }
    onChange(next);
    setOpen(false);
  };

  const handleTime = (timeValue: string) => {
    if (!timeValue) {
      return;
    }
    // "HH:mm" (step=60) has no seconds part: map(Number) leaves a trailing
    // undefined there, and setHours coerces it to NaN → Invalid Date.
    const [hours, minutes, seconds] = timeValue
      .split(":")
      .map((part) => Number.parseInt(part, 10));
    const next = value ? new Date(value) : new Date();
    next.setHours(hours || 0, minutes || 0, seconds || 0, 0);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                id={id}
                className="w-40 justify-between font-normal"
              >
                {value ? format(value, "d MMM yyyy") : "Select date"}
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            }
          />
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              mode="single"
              selected={value}
              captionLayout="dropdown"
              defaultMonth={value}
              onSelect={handleDate}
            />
          </PopoverContent>
        </Popover>
        <Input
          type="time"
          id={`${id}-time`}
          step={60}
          value={value ? format(value, "HH:mm") : ""}
          onChange={(event) => handleTime(event.target.value)}
          className="w-28 appearance-none bg-background [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
        />
      </div>
    </div>
  );
}
