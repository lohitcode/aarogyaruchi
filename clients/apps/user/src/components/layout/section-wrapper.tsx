import { type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@aarogyaruchi/ui/lib/utils";

type SectionWrapperProps = {
  id?: string;
  children: ReactNode;
  className?: string;
};

export function SectionWrapper({
  id,
  children,
  className,
}: SectionWrapperProps) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn("py-20 md:py-28", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 md:px-10">{children}</div>
    </motion.section>
  );
}
