import { createFileRoute } from "@tanstack/react-router"
import { LegalPage, useLegalPage } from "../components/layout/legal-page"
import { useMessages, usePageMetadata } from "../i18n"

export const Route = createFileRoute("/delete-account")({
  component: DeleteAccountPage,
})

function DeleteAccountPage() {
  const doc = useLegalPage("deleteAccount")
  const t = useMessages()
  usePageMetadata({ title: t.meta.deleteAccountTitle })

  return <LegalPage doc={doc} />
}
