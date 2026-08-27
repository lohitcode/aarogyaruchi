import { useMessages } from "../../i18n"
import { SectionWrapper } from "../layout/section-wrapper"
import { SectionLabel } from "../layout/section-label"

/**
 * Editorial stats row in the Sakana style (label + large value), adapted with
 * honest Aarogya figures instead of third-party brand logos.
 */
export function StatsStrip() {
  const t = useMessages()

  const stats = [
    t.stats.items.products,
    t.stats.items.natural,
    t.stats.items.customers,
    t.stats.items.basedIn,
  ]

  return (
    <SectionWrapper className="bg-background">
      <SectionLabel number="07" title={t.stats.label} />
      <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden border border-black/10 bg-black/10 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-background p-8 md:p-10">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-4 text-3xl font-medium tracking-tight text-foreground md:text-4xl">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </SectionWrapper>
  )
}
