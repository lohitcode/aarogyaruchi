import { motion } from "motion/react"
import { useMessages } from "../../i18n"
import { SectionWrapper } from "../layout/section-wrapper"
import { SectionLabel } from "../layout/section-label"

export function AboutSection() {
  const t = useMessages()

  const story = [
    t.about.items.tradition,
    t.about.items.fresh,
    t.about.items.closeToHome,
  ]

  return (
    <SectionWrapper id="about" className="bg-background">
      <SectionLabel number="01" title={t.about.label} />

      <div className="mt-10 grid gap-12 md:grid-cols-12 md:gap-16">
        {/* Portrait-style image, rectangular with subtle border */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="md:col-span-5"
        >
          <div className="aspect-[4/5] w-full overflow-hidden border border-black/10 bg-secondary">
            <img
              src="https://images-cdn.lohit.workers.dev/sprouts.png"
              alt={t.about.imageAlt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </div>
        </motion.div>

        {/* Wider text column */}
        <div className="md:col-span-7">
          <h2>{t.about.heading}</h2>

          {story.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="mt-8 border-t border-black/10 pt-6"
            >
              <h3 className="text-xl font-semibold text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-lg">
                {item.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}
