import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@aarogyaruchi/ui/components/tabs";
import type { Product } from "../../lib/api";
import { useMessages } from "../../i18n";
import type { Messages } from "../../i18n/locales/en";
import { productText } from "../../lib/product-text";

type ProductDetailsTabsProps = {
  product: Product;
};

const NUTRITION_LABELS: Record<
  keyof Messages["productDetail"]["nutritionLabels"],
  keyof Messages["productDetail"]["nutritionLabels"]
> = {
  calories: "calories",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
  fiber: "fiber",
};

export function ProductDetailsTabs({ product }: ProductDetailsTabsProps) {
  const t = useMessages();
  const text = productText(t, product);
  const nutrition = product.nutrition ?? {};

  return (
    <Tabs
      defaultValue="details"
      className="mt-16 border-t border-black/10 pt-12"
    >
      <TabsList>
        <TabsTrigger value="details">
          {t.productDetail.tabs.details}
        </TabsTrigger>
        <TabsTrigger value="ingredients">
          {t.productDetail.tabs.ingredients}
        </TabsTrigger>
        <TabsTrigger value="nutrition">
          {t.productDetail.tabs.nutrition}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="details" className="mt-8">
        <p className="max-w-2xl leading-relaxed text-muted-foreground">
          {text.description}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {text.tags.map((tag) => (
            <span
              key={tag}
              className="bg-secondary px-3 py-1 text-xs font-medium text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="ingredients" className="mt-8">
        <ul className="grid max-w-2xl gap-3 sm:grid-cols-2">
          {text.ingredients.map((ingredient) => (
            <li
              key={ingredient}
              className="flex items-center gap-3 text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 bg-primary" />
              {ingredient}
            </li>
          ))}
        </ul>
      </TabsContent>

      <TabsContent value="nutrition" className="mt-8">
        <div className="grid max-w-2xl grid-cols-2 gap-px overflow-hidden border border-black/10 bg-black/10 sm:grid-cols-5">
          {Object.entries(nutrition).map(([key, val]) => {
            const labelKey =
              NUTRITION_LABELS[key as keyof typeof NUTRITION_LABELS];
            return (
              <div key={key} className="bg-background p-4 text-center">
                <p className="text-xl font-medium text-foreground">{val}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {labelKey ? t.productDetail.nutritionLabels[labelKey] : key}
                </p>
              </div>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );
}
