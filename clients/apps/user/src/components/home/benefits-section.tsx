import { motion } from "motion/react"
import { Leaf, Sprout, Wheat } from "lucide-react"
import { useMessages } from "../../i18n"
import { SectionWrapper } from "../layout/section-wrapper"
import { SectionLabel } from "../layout/section-label"

export function BenefitsSection() {
  const t = useMessages()

  const benefits = [
    { number: "01", icon: Leaf, ...t.benefits.items.natural },
    { number: "02", icon: Sprout, ...t.benefits.items.daily },
    { number: "03", icon: Wheat, ...t.benefits.items.nutrients },
  ]

  return (
    <SectionWrapper id="benefits" className="bg-secondary/40">
      <SectionLabel number="02" title={t.benefits.label} />
      <h2 className="mt-6 max-w-2xl">{t.benefits.heading}</h2>
      <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
        {t.benefits.subheading}
      </p>

      <div className="mt-14 grid gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-3">
        {benefits.map((benefit, i) => (
          <motion.div
            key={benefit.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="bg-background p-8 md:p-10"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-primary">
                {benefit.number}
              </span>
              <benefit.icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-8 text-2xl font-medium text-foreground">
              {benefit.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {benefit.description}
            </p>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  )
}
