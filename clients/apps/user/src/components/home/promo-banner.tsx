import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { useAuth } from "../../lib/auth";
import { useMessages } from "../../i18n";

export function PromoBanner() {
  const { requireAuth } = useAuth();
  const navigate = useNavigate();
  const t = useMessages();
  return (
    <section className="bg-primary text-primary-foreground">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-6 py-16 md:flex-row md:items-center md:justify-between md:px-10 md:py-24"
      >
        <div className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary-foreground/70">
            {t.promo.eyebrow}
          </p>
          <h2 className="mt-4 text-primary-foreground">{t.promo.heading}</h2>
          <p className="mt-4 text-lg text-primary-foreground/80">
            {t.promo.body}
          </p>
        </div>
        <Button
          onClick={() => requireAuth(() => navigate({ to: "/products" }))}
          className="rounded-sm bg-background px-8 py-6 text-base font-medium text-foreground hover:bg-background/90"
        >
          {t.promo.cta}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </motion.div>
    </section>
  );
}
