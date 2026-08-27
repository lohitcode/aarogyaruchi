import { Suspense } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import { useMessages } from "../../i18n";
import { SectionWrapper } from "../layout/section-wrapper";
import { SectionLabel } from "../layout/section-label";
import { StaticMapPreview } from "./google-map";
import { useAuth } from "../../lib/auth";

export function StoreLocator() {
  const { requireAuth } = useAuth();
  const navigate = useNavigate();
  const t = useMessages();
  return (
    <SectionWrapper className="bg-secondary/40">
      <SectionLabel number="06" title={t.storeLocator.label} />
      <h2 className="mt-6 max-w-md">{t.storeLocator.heading}</h2>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <div className="overflow-hidden border border-black/10 md:col-span-2">
          <Suspense
            fallback={
              <div className="flex h-[400px] items-center justify-center bg-secondary">
                <p className="text-sm text-muted-foreground">
                  {t.storeLocator.loadingMap}
                </p>
              </div>
            }
          >
            <StaticMapPreview />
          </Suspense>
        </div>

        <div className="flex flex-col justify-between border border-black/10 bg-background p-8">
          <div>
            <div className="flex h-12 w-12 items-center justify-center bg-primary/10">
              <ShoppingBag className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-5 text-xl font-medium text-foreground">
              {t.storeLocator.cardTitle}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.storeLocator.cardBody}
            </p>
          </div>
          <Button
            onClick={() => requireAuth(() => navigate({ to: "/products" }))}
            className="mt-6 w-full rounded-sm bg-primary px-6 py-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t.storeLocator.cta}
          </Button>
        </div>
      </div>
    </SectionWrapper>
  );
}
