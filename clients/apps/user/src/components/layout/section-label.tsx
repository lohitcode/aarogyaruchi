import { cn } from "@aarogyaruchi/ui/lib/utils";

type SectionLabelProps = {
  /** Two-digit chapter number, e.g. "01" */
  number: string;
  /** Uppercase chapter title, e.g. "OUR STORY" */
  title: string;
  className?: string;
};

/**
 * Editorial chapter label in the Sakana style: a small muted-gray line like
 * "01 / OUR STORY" that anchors each section. Used as the header above home
 * sections to mirror sakana.ai/applied-careers' numbered chapters.
 */
export function SectionLabel({ number, title, className }: SectionLabelProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground",
        className
      )}
    >
      <span className="text-primary">{number}</span>
      <span className="text-muted-foreground/50">/</span>
      <span>{title}</span>
    </div>
  );
}
