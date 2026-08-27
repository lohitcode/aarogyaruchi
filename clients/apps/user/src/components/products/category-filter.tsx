import { cn } from "@aarogyaruchi/ui/lib/utils";
import { useMessages } from "../../i18n";

type CategoryFilterProps = {
  value: string;
  onChange: (value: string) => void;
  /** Distinct categories from the live catalog. */
  categories: string[];
};

/** Human labels for the categories the operator manages; unknown ones pass through. */
const KNOWN_LABELS: Record<string, "all" | "meals" | "snacks" | "drinks"> = {
  meals: "meals",
  snacks: "snacks",
  drinks: "drinks",
};

export function CategoryFilter({
  value,
  onChange,
  categories,
}: CategoryFilterProps) {
  const t = useMessages();

  const options: { value: string; label: string }[] = [
    { value: "all", label: t.productsPage.categories.all },
    ...categories.map((c) => ({
      value: c,
      label: KNOWN_LABELS[c] ? t.productsPage.categories[KNOWN_LABELS[c]] : c,
    })),
  ];

  return (
    <div
      className="flex w-full flex-wrap items-center gap-1 border-b border-black/10"
      role="tablist"
      aria-label={t.productsPage.categoriesAria}
    >
      {options.map((cat) => {
        const active = value === cat.value;
        return (
          <button
            key={cat.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(cat.value)}
            className={cn(
              "-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
