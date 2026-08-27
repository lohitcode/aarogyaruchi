import { motion } from "motion/react"
import { Leaf } from "lucide-react"
import { useMessages } from "../../i18n"
import { SectionWrapper } from "../layout/section-wrapper"
import { SectionLabel } from "../layout/section-label"

export function IngredientsSection() {
  const t = useMessages()

  return (
    <SectionWrapper className="bg-background">
      <SectionLabel number="03" title={t.ingredients.label} />

      <div className="mt-10 grid gap-12 md:grid-cols-12 md:gap-16">
        {/* Wider text column */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="md:col-span-7"
        >
          <h2 className="max-w-md">{t.ingredients.heading}</h2>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            {t.ingredients.body}
          </p>
          <div className="mt-8 border-l-2 border-primary pl-5">
            <p className="text-lg font-medium text-foreground">
              &ldquo;{t.ingredients.quote}&rdquo;
            </p>
          </div>
        </motion.div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="md:col-span-5"
        >
          <div className="flex aspect-square w-full items-center justify-center border border-black/10 bg-secondary/40 p-8">
            <div className="grid grid-cols-3 gap-5">
              {[...Array(9)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [1, 1.12, 1],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Number.POSITIVE_INFINITY,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                  className="flex items-center justify-center"
                >
                  <Leaf className="h-7 w-7 text-primary/30" />
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </SectionWrapper>
  )
}
