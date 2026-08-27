import { createFileRoute } from "@tanstack/react-router"
import { LegalPage, useLegalPage } from "../components/layout/legal-page"
import { useMessages, usePageMetadata } from "../i18n"

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicyPage,
})

function PrivacyPolicyPage() {
  const doc = useLegalPage("privacy")
  const t = useMessages()
  usePageMetadata({
    title: t.meta.privacyTitle,
    description: t.meta.homeDescription,
  })

  return <LegalPage doc={doc} />
}
