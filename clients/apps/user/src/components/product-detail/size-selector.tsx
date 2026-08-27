import {
  ToggleGroup,
  ToggleGroupItem,
} from "@aarogyaruchi/ui/components/toggle-group";
import type { Variant } from "../../lib/api";

type SizeSelectorProps = {
  variants: Variant[];
  value: string;
  onChange: (value: string) => void;
};

export function SizeSelector({ variants, value, onChange }: SizeSelectorProps) {
  return (
    <ToggleGroup
      value={value ? [value] : []}
      onValueChange={(group: readonly string[]) => {
        // Base UI toggle groups hold an array; take the most recent toggle
        // as the single selection and ignore deselection of the current one.
        const next = group[group.length - 1];
        if (next) onChange(next);
      }}
      className="flex flex-wrap gap-2"
    >
      {variants.map((variant) => {
        const label = [variant.size_label, variant.unit]
          .filter(Boolean)
          .join(" · ");
        return (
          <ToggleGroupItem
            key={variant.id}
            value={String(variant.id)}
            className="border border-black/15 bg-background px-4 py-2 text-sm text-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {label || variant.slug}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
