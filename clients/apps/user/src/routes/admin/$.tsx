import { createFileRoute, redirect } from "@tanstack/react-router"
import { ADMIN_ORIGIN } from "../../config/api"

/**
 * The ops console moved to its own app at admin.aarogyaruchi.com with the
 * /admin prefix dropped (aarogyaruchi.com/admin/orders →
 * admin.aarogyaruchi.com/orders); every old path 307s there, query intact.
 */
export const Route = createFileRoute("/admin/$")({
  beforeLoad: ({ location }) => {
    const path = location.pathname.replace(/^\/admin/, "") || "/"
    throw redirect({
      href: `${ADMIN_ORIGIN}${path}${location.searchStr}`,
      replace: true,
    })
  },
})
