import { useRef } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@aarogyaruchi/ui/components/avatar";
import { reviews } from "../../data/reviews";
import { useMessages } from "../../i18n";
import { SectionWrapper } from "../layout/section-wrapper";
import { SectionLabel } from "../layout/section-label";

export function ReviewsSection() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = useMessages();

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 340;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <SectionWrapper id="reviews" className="bg-background">
      <div className="flex items-end justify-between">
        <div>
          <SectionLabel number="05" title={t.reviewsSection.label} />
          <h2 className="mt-6 max-w-md">{t.reviewsSection.heading}</h2>
        </div>
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            onClick={() => scroll("left")}
            className="flex h-11 w-11 items-center justify-center border border-black/10 text-foreground transition-colors hover:bg-foreground hover:text-background"
            aria-label={t.reviewsSection.scrollLeft}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="flex h-11 w-11 items-center justify-center border border-black/10 text-foreground transition-colors hover:bg-foreground hover:text-background"
            aria-label={t.reviewsSection.scrollRight}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="mt-12 flex snap-x gap-6 overflow-x-auto pb-4"
        style={{ scrollbarWidth: "none" }}
      >
        {reviews.map((review, i) => {
          const localized = t.catalog.reviews[review.id] ?? {
            text: review.text,
            product: review.product,
          };
          return (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="w-[320px] flex-none snap-start border border-black/10 bg-background p-7"
            >
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star
                    key={`star-${review.id}-${idx}`}
                    className={`h-4 w-4 ${idx < review.rating ? "fill-primary text-primary" : "text-black/15"}`}
                  />
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/80">
                &ldquo;{localized.text}&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-black/10 pt-4">
                <Avatar>
                  <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                    {review.avatar}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {review.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {localized.product}
                  </p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}
