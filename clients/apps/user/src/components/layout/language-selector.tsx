import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aarogyaruchi/ui/components/select";
import { LOCALES, useI18n, type Locale } from "../../i18n";

/**
 * Keyboard-accessible locale picker (Radix Select: arrow keys, type-ahead,
 * Escape). Native language names are endonyms shown identically in every
 * locale, so no translation is needed for the options themselves.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  const nativeNames: Record<Locale, string> = {
    en: t.language.english,
    te: t.language.telugu,
    hi: t.language.hindi,
  };

  /*
   * iOS standalone PWAs jump the page to the document top when the popup
   * takes focus (browsers are unaffected). Non-modal mode + trigger-aligned
   * positioning remove the known triggers; the guard below restores the
   * scroll position once if the webview still jumps.
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    const y = window.scrollY;
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - y) > 8) {
        window.scrollTo({ top: y, behavior: "instant" });
      }
    }, 250);
  };

  return (
    <Select
      value={locale}
      onValueChange={(value) => setLocale(value as Locale)}
      onOpenChange={handleOpenChange}
      modal={false}
    >
      <SelectTrigger
        aria-label={t.language.selectorLabel}
        className={`w-auto gap-1.5 border-none bg-transparent px-2.5 shadow-none text-sm font-medium text-foreground/70 hover:bg-secondary hover:text-foreground ${className ?? ""}`}
      >
        <Globe className="h-4 w-4" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {nativeNames[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
