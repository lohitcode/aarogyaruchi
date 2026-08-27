import { createFileRoute } from "@tanstack/react-router"
import { LegalPage, useLegalPage } from "../components/layout/legal-page"
import { useMessages, usePageMetadata } from "../i18n"

export const Route = createFileRoute("/terms-of-service")({
  component: TermsOfServicePage,
})

function TermsOfServicePage() {
  const doc = useLegalPage("terms")
  const t = useMessages()
  usePageMetadata({
    title: t.meta.termsTitle,
    description: t.meta.homeDescription,
  })

  return <LegalPage doc={doc} />
}
