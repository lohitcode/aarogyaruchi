import { useEffect, useMemo, useState } from "react";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart3,
  Bike,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@aarogyaruchi/ui/components/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@aarogyaruchi/ui/components/sidebar";

import appCss from "../styles.css?url";
import { fetchAdminSession, type AdminSession } from "../lib/admin";
import { MANAGE_TABS } from "./manage";
import { ServiceWorkerRegister } from "../components/service-worker-register";
import { NotificationBanner } from "../components/notification-banner";

/**
 * Root of the standalone ops app (admin.aarogyaruchi.com). Same shell the
 * panel had when it lived under aarogyaruchi.com/admin: session-guarded
 * chrome around every page except the login route at "/", which renders
 * bare. Authorization is enforced by the backend — this guard is UX, not
 * security.
 */

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/users", label: "Customers", icon: Users },
  { to: "/batches", label: "Batches", icon: Package },
  { to: "/runs", label: "Delivery runs", icon: Bike },
  { to: "/live", label: "Live map", icon: BarChart3 },
  { to: "/cash", label: "Cash", icon: Wallet },
] as const;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Admin — Aarogya Ruchi" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#171717" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: "AR Ops" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.svg?v=2",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32.png?v=2",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png?v=2",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),

  component: AdminRoot,
});

function AdminRoot() {
  // One client per mount: fresh on every SSR request (no cross-user cache
  // leaks) and a single long-lived instance in the browser.
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
      }),
    []
  );

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-neutral-50 font-sans text-foreground antialiased">
        <QueryClientProvider client={queryClient}>
          <AdminShell />
        </QueryClientProvider>
        <Scripts />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

function AdminShell() {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchAdminSession().then((a) => {
      setAdmin(a);
      setLoading(false);
      // Login page lives at "/" itself; every other route requires an
      // admin session.
      if (!a && location.pathname !== "/") {
        navigate({ to: "/", replace: true });
      }
      if (a && location.pathname === "/") {
        navigate({ to: "/dashboard", replace: true });
      }
    });
  }, [navigate, location.pathname]);

  const logout = async () => {
    const { API_BASE_URL } = await import("../config/api");
    await fetch(`${API_BASE_URL}/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    setAdmin(null);
    navigate({ to: "/", replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  // The login route renders bare.
  if (!admin) {
    return <Outlet />;
  }

  const who = admin.name || admin.phone;

  return (
    <SidebarProvider>
      <AppSidebar
        admin={admin}
        pathname={location.pathname}
        search={location.search}
        onLogout={logout}
      />
      <SidebarInset className="bg-neutral-50">
        {/* Mobile header: on <md the sidebar collapses into a Sheet drawer
            opened by this trigger. Desktop keeps the full sidebar (plus the
            hover rail / Ctrl-B shortcut to slide it away). */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <SidebarTrigger />
          <p className="text-sm font-semibold text-neutral-900">
            AR Operations
          </p>
          <p className="min-w-0 truncate text-xs text-neutral-500">{who}</p>
        </header>

        {/* Nudge to allow notifications (chat + new-order alerts);
            re-checked on every app open, above the page content so it shows
            on desktop and mobile alike. */}
        <NotificationBanner />

        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * Sidebar nav. "Manage" is a collapsible item whose sub-items are the
 * manage tabs (Products/Localities/Partners/Admins/Settings) — they link
 * to /manage?tab=<key> so the active tab is URL-driven and shareable.
 * Sub-items a non-super admin can't reach are hidden here; the manage page
 * still guards direct URL hits.
 */
function AppSidebar({
  admin,
  pathname,
  search,
  onLogout,
}: {
  admin: AdminSession;
  pathname: string;
  search: { tab?: string };
  onLogout: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  const isSuper = admin.role === "super_admin";
  const manageActive = pathname.startsWith("/manage");
  const manageTab = search.tab ?? "products";
  // Close the mobile drawer on any navigation.
  const closeDrawer = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="p-4">
        <p className="text-sm font-semibold text-foreground">
          AR Operations
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {admin.name || admin.phone}
        </p>
        <p className="mt-0.5 text-[10px] tracking-wide text-muted-foreground/70 uppercase">
          {admin.role.replace("_", " ")}
        </p>
      </SidebarHeader>
      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(to)}
                    render={
                      <Link to={to} onClick={closeDrawer} />
                    }
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

              <SidebarMenuItem>
                <Collapsible
                  defaultOpen={manageActive}
                  className="group/collapsible"
                >
                  <CollapsibleTrigger
                    render={<SidebarMenuButton isActive={manageActive} />}
                  >
                    <Settings />
                    <span>Manage</span>
                    <ChevronDown className="ml-auto transition-transform group-data-open/collapsible:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {MANAGE_TABS.filter(
                        (t) =>
                          isSuper ||
                          t.key === "products" ||
                          t.key === "localities"
                      ).map((t) => (
                        <SidebarMenuSubItem key={t.key}>
                          <SidebarMenuSubButton
                            isActive={manageActive && manageTab === t.key}
                            render={
                              <Link
                                to="/manage"
                                search={{ tab: t.key }}
                                onClick={closeDrawer}
                              />
                            }
                          >
                            <span>{t.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onLogout}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
