import { BUSINESS } from "../../config/business";
import { useMessages } from "../../i18n";
import type { LegalBlock, LegalDoc } from "../../i18n/types";
import { Footer } from "./footer";

type LegalPageProps = {
  doc: LegalDoc;
};

/**
 * Locale files use {brand}/{operator}/{email}/{phone}/{address} placeholders
 * so business facts stay single-sourced from the config.
 */
function fillPlaceholders(text: string): string {
  return text
    .replaceAll("{brand}", BUSINESS.brandName)
    .replaceAll("{operator}", BUSINESS.legalOperator)
    .replaceAll("{email}", BUSINESS.email)
    .replaceAll("{phone}", BUSINESS.phoneDisplay)
    .replaceAll("{address}", BUSINESS.address);
}

function ContactList({ labels }: { labels: LegalDoc["contactLabels"] }) {
  return (
    <ul className="ml-4 space-y-1">
      <li>
        <strong>{labels.operator}</strong> {BUSINESS.legalOperator}
      </li>
      <li>
        <strong>{labels.email}</strong>{" "}
        <a
          className="underline hover:text-primary"
          href={`mailto:${BUSINESS.email}`}
        >
          {BUSINESS.email}
        </a>
      </li>
      <li>
        <strong>{labels.phone}</strong>{" "}
        <a
          className="underline hover:text-primary"
          href={`tel:${BUSINESS.phoneE164}`}
        >
          {BUSINESS.phoneDisplay}
        </a>
      </li>
      <li>
        <strong>{labels.address}</strong> {BUSINESS.address}
      </li>
      <li>
        <strong>{labels.grievance}</strong> {BUSINESS.legalOperator},{" "}
        {BUSINESS.email}
      </li>
    </ul>
  );
}

/** Renders one block of a translated legal document. */
function LegalBlockView({
  block,
  labels,
}: {
  block: LegalBlock;
  labels: LegalDoc["contactLabels"];
}) {
  switch (block.kind) {
    case "h3":
      return (
        <h3 className="mt-4 text-lg font-semibold text-foreground">
          {fillPlaceholders(block.text)}
        </h3>
      );
    case "ul":
      return (
        <ul className="ml-4 list-disc space-y-1">
          {block.items.map((item) => (
            <li key={item}>{fillPlaceholders(item)}</li>
          ))}
        </ul>
      );
    case "contact":
      return <ContactList labels={labels} />;
    default:
      return <p>{fillPlaceholders(block.text)}</p>;
  }
}

export function LegalPage({ doc }: LegalPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
          <div className="mb-10 border-b border-black/10 pb-8">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {doc.eyebrow}
            </p>
            <h1 className="mt-4 text-foreground">{doc.title}</h1>
            {doc.lastUpdated ? (
              <p className="mt-3 text-muted-foreground">{doc.lastUpdated}</p>
            ) : null}
          </div>
          <div className="space-y-8 leading-relaxed text-muted-foreground">
            {doc.sections.map((section) => (
              <section key={section.heading} className="space-y-4">
                {section.heading ? (
                  <h2 className="font-heading text-2xl text-foreground">
                    {fillPlaceholders(section.heading)}
                  </h2>
                ) : null}
                {section.blocks.map((block, i) => (
                  <LegalBlockView
                    key={`${section.heading}-${i}`}
                    block={block}
                    labels={doc.contactLabels}
                  />
                ))}
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

/** Convenience hook so routes stay one-liners. */
export function useLegalPage(kind: "privacy" | "terms" | "deleteAccount") {
  const t = useMessages();
  return t.legal[kind];
}
