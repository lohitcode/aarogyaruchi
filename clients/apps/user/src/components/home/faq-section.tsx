import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown } from "lucide-react"
import { faqs } from "../../data/faq"
import { useMessages } from "../../i18n"
import { SectionWrapper } from "../layout/section-wrapper"
import { SectionLabel } from "../layout/section-label"

export function FaqSection() {
  const t = useMessages()
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null)

  return (
    <SectionWrapper id="faq" className="bg-background">
      <SectionLabel number="08" title={t.faqSection.label} />
      <h2 className="mt-6 max-w-md">{t.faqSection.heading}</h2>

      <div className="mt-12 max-w-3xl">
        {faqs.map((faq) => {
          const isOpen = openId === faq.id
          const localized = t.catalog.faqs[faq.id] ?? {
            question: faq.question,
            answer: faq.answer,
          }
          return (
            <div key={faq.id} className="border-b border-black/10">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : faq.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 py-6 text-left text-base font-medium text-foreground transition-colors hover:text-primary md:py-7 md:text-lg"
              >
                {localized.question}
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                  className="flex shrink-0 items-center"
                >
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 pr-6 text-sm leading-relaxed text-muted-foreground md:text-base">
                      {localized.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </SectionWrapper>
  )
}
