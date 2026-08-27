import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { SectionWrapper } from "../layout/section-wrapper";

const categories = [
  { label: "Meals", color: "bg-primary text-primary-foreground" },
  { label: "Snacks", color: "bg-secondary text-secondary-foreground" },
  { label: "Drinks", color: "bg-primary text-primary-foreground" },
  { label: "Organic", color: "bg-secondary text-secondary-foreground" },
  { label: "Gluten-Free", color: "bg-primary text-primary-foreground" },
  { label: "High-Protein", color: "bg-secondary text-secondary-foreground" },
];

export function ProductLineCta() {
  return (
    <SectionWrapper className="bg-muted">
      <div className="text-center">
        <h2 className="font-heading text-4xl text-foreground md:text-5xl">
          Try the Complete Range
        </h2>
        <p className="mx-auto mt-3 max-w-lg font-sans text-muted-foreground">
          From wholesome meals to energizing drinks, we have something for every
          moment of your day.
        </p>
        <div className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-3">
          {categories.map((cat) => (
            <span
              key={cat.label}
              className={`${cat.color} rounded-full border-2 border-foreground px-5 py-2 font-heading text-sm`}
            >
              {cat.label}
            </span>
          ))}
        </div>
        <div className="mt-8">
          <Link to="/products">
            <Button className="rounded-full border-[3px] border-primary bg-primary px-8 py-6 font-sans text-lg font-medium text-primary-foreground hover:bg-primary/90">
              Explore All Products
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </SectionWrapper>
  );
}
