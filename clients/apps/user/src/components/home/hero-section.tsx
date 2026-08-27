import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { useAuth } from "../../lib/auth";
import { useMessages } from "../../i18n";

const ROTATE_INTERVAL = 3200;

export function HeroSection() {
  const [wordIndex, setWordIndex] = useState(0);
  const { requireAuth } = useAuth();
  const navigate = useNavigate();
  const t = useMessages();

  // Noun forms so "Taste the goodness of <word>" reads grammatically in
  // every locale (Health ← healthy, Flavor ← delicious, Nature ← natural).
  const rotatingWords = t.hero.words;

  useEffect(() => {
    const id = setInterval(
      () => setWordIndex((i) => (i + 1) % rotatingWords.length),
      ROTATE_INTERVAL
    );
    return () => clearInterval(id);
  }, [rotatingWords.length]);

  return (
    <section className="relative overflow-hidden bg-background">
      {/* Soft accent glow (Sakana hero motif). The gradient fades to full
          transparency inside its own bounds so motion never exposes a hard
          filter edge. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-64 -top-64 h-[760px] w-[760px] rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(circle at center, rgba(34,197,94,0.3) 0%, rgba(34,197,94,0.16) 32%, rgba(21,128,61,0.07) 52%, rgba(21,128,61,0.025) 64%, transparent 72%)",
        }}
        animate={{
          // x and y wander independently so the blob roams in every
          // direction (left/right/up/down/diagonal) rather than on a line.
          x: [0, -480, -780, -300, 160, -560, -120, 0],
          y: [0, 170, -130, 210, 90, -160, 200, 0],
          scale: [1, 1.1, 0.96, 1.14, 1, 1.06, 0.98, 1],
        }}
        transition={{
          duration: 34,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="mx-auto w-full max-w-6xl px-6 pb-20 pt-20 md:px-10 md:pb-32 md:pt-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground"
        >
          {t.hero.eyebrow}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-6 flex max-w-4xl flex-col gap-3 text-foreground md:gap-5"
        >
          <span>{t.hero.headline}</span>
          {/* Rotating word: in-flow so the box always fits the current word
              (no clipped periods); fixed height + overflow-hidden clips the
              vertical slide in/out on each cycle. */}
          <span className="relative block h-[1.1em] w-fit overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={rotatingWords[wordIndex]}
                initial={{ y: "115%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "-115%", opacity: 0 }}
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block text-primary"
              >
                {rotatingWords[wordIndex]}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 max-w-xl text-lg text-muted-foreground md:text-xl"
        >
          {t.hero.subheading}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Button
            onClick={() => requireAuth(() => navigate({ to: "/products" }))}
            className="rounded-sm bg-primary px-7 py-6 text-base font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t.hero.buyNow}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <a href="#about">
            <Button
              variant="outline"
              className="rounded-sm border border-foreground px-7 py-6 text-base font-medium text-foreground hover:bg-foreground hover:text-background"
            >
              {t.hero.learnMore}
            </Button>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
