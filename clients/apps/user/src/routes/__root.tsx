import { useMemo } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import appCss from "../styles.css?url";
import { ServiceWorkerRegister } from "../components/service-worker-register";
import { ChatWidget } from "../components/chat/chat-widget";
import { AuthProvider } from "../lib/auth";
import { CartProvider } from "../lib/cart";
import { ProfileGate } from "../components/auth/profile-gate";
import { I18nProvider } from "../i18n";
import { Navbar } from "../components/layout/navbar";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "Aarogya Ruchi - Healthy & Delicious Meals",
      },
      {
        name: "description",
        content:
          "Fresh, healthy, and delicious home-style meals delivered to your doorstep.",
      },
      // PWA - Theme Color
      {
        name: "theme-color",
        content: "#15803D",
      },
      // PWA - Apple Mobile Web App
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "default",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "Aarogya Ruchi",
      },
      // PWA - Windows
      {
        name: "msapplication-TileColor",
        content: "#15803D",
      },
      {
        name: "msapplication-config",
        content: "/browserconfig.xml",
      },
      // SEO
      {
        name: "application-name",
        content: "Aarogya Ruchi",
      },
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      // Open Graph — rich link previews in WhatsApp, Telegram, Facebook, LinkedIn
      {
        property: "og:site_name",
        content: "Aarogya Ruchi",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://aarogyaruchi.com/",
      },
      {
        property: "og:title",
        content: "Aarogya Ruchi — Healthy, fresh & traditional food",
      },
      {
        property: "og:description",
        content:
          "Sprouts, ragi drinks & cold-pressed juices, prepared fresh each morning in Bachupally, Hyderabad. Order through our website and pay cash on delivery.",
      },
      {
        property: "og:image",
        content: "https://aarogyaruchi.com/og-image.jpg",
      },
      {
        property: "og:image:type",
        content: "image/jpeg",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        property: "og:image:alt",
        content: "Aarogya Ruchi — healthy, honest food made fresh every day.",
      },
      {
        property: "og:locale",
        content: "en_IN",
      },
      // Twitter / X
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "Aarogya Ruchi — Healthy, fresh & traditional food",
      },
      {
        name: "twitter:description",
        content:
          "Sprouts, ragi drinks & cold-pressed juices, prepared fresh each morning in Bachupally, Hyderabad. Order through our website and pay cash on delivery.",
      },
      {
        name: "twitter:image",
        content: "https://aarogyaruchi.com/og-image.jpg",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico?v=3",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32.png?v=3",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/favicon-192.png?v=3",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg?v=3",
      },
      // PWA - Apple Touch Icons (Safari / iOS home screen)
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-touch-icon.png?v=3",
      },
      {
        rel: "apple-touch-icon",
        sizes: "192x192",
        href: "/favicon-192.png?v=3",
      },
      {
        rel: "apple-touch-icon",
        sizes: "512x512",
        href: "/favicon-512.png?v=3",
      },
      // PWA - Manifest
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      // PWA - Splash Screens for iOS
      {
        rel: "apple-touch-startup-image",
        href: "/apple-touch-startup-image-640x1136.png",
        media:
          "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/apple-touch-startup-image-750x1294.png",
        media:
          "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
    ],
  }),

  component: RootComponent,
});

function RootComponent() {
  // One client per mount: fresh on every SSR request (no cross-user cache
  // leaks) and a single long-lived instance in the browser. Customer-side
  // hooks (chat unread, support) live below this provider; /admin nests its
  // own client for its panel cache.
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
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <AuthProvider>
              <CartProvider>
                {/* Site header on every route — sticky, above the ProfileGate
                    overlay (z-40) so menus stay usable while gated. */}
                <Navbar />
                <Outlet />
                {/* Blocks interaction until name + address exist; the navbar
                    (z-50) stays above the overlay (z-40) so menus remain usable. */}
                <ProfileGate />
              </CartProvider>
            </AuthProvider>
            <ChatWidget />
          </I18nProvider>
        </QueryClientProvider>
        <Scripts />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
