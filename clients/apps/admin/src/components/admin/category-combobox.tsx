import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@aarogyaruchi/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aarogyaruchi/ui/components/popover";

/**
 * Categories exist only as values on product rows — no category table. The
 * option list is derived from the live admin products query, so deleting the
 * last product of a category makes it disappear here on the next refetch.
 */
export function uniqueCategories(
  products: Array<{ category?: string | null }>
): string[] {
  const seen = new Set<string>();
  for (const p of products) {
    const c = (p.category ?? "").trim();
    if (c) seen.add(c);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * Editable category picker: choose an existing category from the dropdown or
 * type a new one and pick the "Create …" row. Empty selection is allowed.
 */
export function CategoryCombobox({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (next: string) => void;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const exactExists =
    trimmed !== "" &&
    categories.some((c) => c.toLowerCase() === trimmed.toLowerCase());

  const commit = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            role="combobox"
            aria-label="Category"
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 border border-neutral-300 bg-white px-3 py-2 text-sm hover:border-neutral-400 focus:border-neutral-500 focus:outline-none"
          >
            {value.trim() ? (
              <span>{value}</span>
            ) : (
              <span className="text-neutral-400">Pick or type a category…</span>
            )}
            <ChevronsUpDown
              className="h-4 w-4 shrink-0 text-neutral-400"
              aria-hidden
            />
          </button>
        }
      />
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type a new category…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No match — type below to create it.</CommandEmpty>
            {trimmed !== "" && !exactExists && (
              <CommandGroup>
                <CommandItem
                  value={`create-${trimmed}`}
                  onSelect={() => commit(trimmed)}
                >
                  <span>
                    Create <span className="font-medium">“{trimmed}”</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {categories.map((c) => (
                <CommandItem key={c} value={c} onSelect={() => commit(c)}>
                  <Check
                    className={`mr-1 h-4 w-4 ${value === c ? "" : "opacity-0"}`}
                    aria-hidden
                  />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
