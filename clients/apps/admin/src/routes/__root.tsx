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
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  Users,
  Wallet,
  X,
} from "lucide-react";

import appCss from "../styles.css?url";
import { fetchAdminSession, type AdminSession } from "../lib/admin";
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
  { to: "/manage", label: "Manage", icon: Settings },
];

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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

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
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="sticky top-0 hidden h-screen w-56 flex-col border-r border-neutral-200 bg-white lg:flex">
        <SidebarContent
          admin={admin}
          pathname={location.pathname}
          onLogout={logout}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            className="border border-neutral-300 p-1.5 text-neutral-700 hover:bg-neutral-50"
          >
            <Menu className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold text-neutral-900">
            AR Operations
          </p>
          <p className="min-w-0 truncate text-xs text-neutral-500">{who}</p>
        </header>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
            />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-neutral-200 bg-white">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="absolute top-3 right-3 z-10 p-1.5 text-neutral-400 hover:text-neutral-900"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent
                admin={admin}
                pathname={location.pathname}
                onNavigate={() => setDrawerOpen(false)}
                onLogout={logout}
              />
            </aside>
          </div>
        )}

        {/* Nudge to allow notifications (chat + new-order alerts);
            re-checked on every app open, above the page content so it shows
            on desktop and mobile alike. */}
        <NotificationBanner />

        <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  admin,
  pathname,
  onNavigate,
  onLogout,
}: {
  admin: AdminSession;
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="border-b border-neutral-200 px-4 py-5">
        <p className="text-sm font-semibold text-neutral-900">AR Operations</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          {admin.name || admin.phone}
        </p>
        <p className="mt-0.5 text-[10px] tracking-wide text-neutral-400 uppercase">
          {admin.role.replace("_", " ")}
        </p>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              onClick={onNavigate}
              className={`flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-neutral-900 font-medium text-white"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        onClick={onLogout}
        className="flex items-center gap-2.5 border-t border-neutral-200 px-5 py-4 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </>
  );
}
