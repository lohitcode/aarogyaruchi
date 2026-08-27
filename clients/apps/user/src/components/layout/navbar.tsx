import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  ChevronLeft,
  Leaf,
  LogOut,
  MessageCircle,
  Menu,
  Package,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  User,
} from "lucide-react";
import { Button } from "@aarogyaruchi/ui/components/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@aarogyaruchi/ui/components/navigation-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@aarogyaruchi/ui/components/sheet";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { useChatUnread } from "../../lib/chat";
import { useMessages } from "../../i18n";
import { LanguageSelector } from "./language-selector";

export function Navbar() {
  const { user, logout, openLogin, requireAuth } = useAuth();
  const { count } = useCart();
  const unreadSupport = useChatUnread();
  const navigate = useNavigate();
  const router = useRouter();
  const { pathname } = useLocation();
  const isHome = pathname === "/";
  const t = useMessages();

  // App-style back: return through history when the user arrived by
  // navigating, otherwise fall back to home (direct landing on a deep link).
  const goBack = () => {
    if (window.history.state?.idx > 0) {
      router.history.back();
    } else {
      navigate({ to: "/" });
    }
  };

  const navLinks: {
    label: string;
    href?: string;
    anchor?: string;
    unread?: boolean;
  }[] = [
    { label: t.nav.products, href: "/products" },
    { label: t.nav.support, href: "/support", unread: unreadSupport > 0 },
    { label: t.nav.story, anchor: "#about" },
    { label: t.nav.benefits, anchor: "#benefits" },
    { label: t.nav.reviews, anchor: "#reviews" },
    { label: t.nav.faq, anchor: "#faq" },
  ];

  const orderNow = () => requireAuth(() => navigate({ to: "/products" }));

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-black/10 bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:h-20 md:px-10">
        {/* Left cluster: back chevron (non-home routes) with the logo right
            beside it — never centered. Both reveal/hide animations are CSS
            transitions on persistent elements: JS-driven (motion) frames get
            starved by route mounting in the same instant and stutter. No flex
            gaps here — spacing lives on always-mounted elements so the
            transitions are continuous with no unmount snap. */}
        <div className="flex items-center">
          <div
            className="overflow-hidden transition-[width,margin-left] duration-[250ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{
              width: isHome ? 0 : 32,
              marginLeft: isHome ? 0 : "-0.875rem",
            }}
          >
            <button
              type="button"
              onClick={goBack}
              aria-label={t.nav.back}
              tabIndex={isHome ? -1 : undefined}
              aria-hidden={isHome}
              className={
                "flex h-9 w-8 items-center justify-center rounded-sm text-foreground/70 transition-[opacity,transform,color,background-color] duration-[250ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:bg-secondary hover:text-foreground " +
                (isHome ? "pointer-events-none" : "")
              }
              style={{
                opacity: isHome ? 0 : 1,
                transform: isHome ? "translateX(-6px)" : "translateX(0)",
              }}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Logo — the wordmark collapses while the back chevron is showing
              so the bar stays uncluttered on non-home routes. */}
          <Link to="/" className="flex items-center">
            <span className="mr-2.5 flex h-9 w-9 items-center justify-center rounded-sm bg-primary text-xl font-semibold text-primary-foreground">
              అ
            </span>
            <span
              aria-hidden={!isHome}
              className="overflow-hidden text-lg font-medium whitespace-nowrap tracking-tight text-foreground transition-[max-width,opacity] duration-[250ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ maxWidth: isHome ? "9rem" : 0, opacity: isHome ? 1 : 0 }}
            >
              Aarogya Ruchi
            </span>
          </Link>
        </div>

        {/* Desktop nav — shadcn-style hover menus keep the bar clean */}
        <div className="hidden items-center gap-6 md:flex">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="rounded-sm bg-transparent px-3 text-sm font-normal text-foreground/70 hover:bg-transparent hover:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-foreground">
                  {t.nav.menu}
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[420px] grid-cols-2 gap-2 p-3">
                    <p className="col-span-1 px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      {t.nav.groupShop}
                    </p>
                    <p className="col-span-1 px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      {t.nav.groupCompany}
                    </p>
                    <MenuLink
                      to="/products"
                      icon={<ShoppingBag className="h-4 w-4" />}
                      title={t.nav.products}
                      description={t.nav.productsDesc}
                    />
                    <MenuAnchor
                      href="#about"
                      icon={<Leaf className="h-4 w-4" />}
                      title={t.nav.story}
                      description={t.nav.storyDesc}
                    />
                    <MenuLink
                      to="/support"
                      icon={<MessageCircle className="h-4 w-4" />}
                      title={t.nav.support}
                      description={t.nav.supportDesc}
                      showUnreadDot={unreadSupport > 0}
                    />
                    <MenuAnchor
                      href="#benefits"
                      icon={<Sparkles className="h-4 w-4" />}
                      title={t.nav.benefits}
                      description={t.nav.benefitsDesc}
                    />
                    <MenuLink
                      to="/cart"
                      icon={<ShoppingCart className="h-4 w-4" />}
                      title={t.shop.cartTitle}
                      description={t.nav.cartDesc}
                    />
                    <MenuAnchor
                      href="#reviews"
                      icon={<Star className="h-4 w-4" />}
                      title={t.nav.reviews}
                      description={t.nav.reviewsDesc}
                    />
                    <MenuLink
                      to="/orders"
                      icon={<Package className="h-4 w-4" />}
                      title={t.shop.ordersTitle}
                      description={t.nav.ordersDesc}
                    />
                    <MenuAnchor
                      href="#faq"
                      icon={<MessageCircle className="h-4 w-4" />}
                      title={t.nav.faq}
                      description={t.nav.faqDesc}
                    />
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {user ? (
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="gap-1.5 rounded-sm bg-transparent px-3 text-sm font-medium text-foreground/80 hover:bg-transparent hover:text-foreground data-[state=open]:bg-transparent data-[state=open]:text-foreground">
                    <User className="h-4 w-4" />
                    <span className="max-w-32 truncate">
                      {user.name || user.phone}
                    </span>
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="grid w-56 gap-1 p-2">
                      <MenuLink
                        to="/profile"
                        icon={<User className="h-4 w-4" />}
                        title={t.nav.profile}
                        description={t.nav.profileDesc}
                      />
                      <MenuLink
                        to="/orders"
                        icon={<Package className="h-4 w-4" />}
                        title={t.shop.ordersTitle}
                        description={t.nav.ordersDesc}
                      />
                      <MenuLink
                        to="/support"
                        icon={<MessageCircle className="h-4 w-4" />}
                        title={t.nav.support}
                        description={t.nav.supportDesc}
                        showUnreadDot={unreadSupport > 0}
                      />
                      <div className="my-1 h-px bg-black/10" />
                      <button
                        type="button"
                        onClick={logout}
                        className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <LogOut className="h-4 w-4" />
                        {t.nav.logout}
                      </button>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ) : null}
            </NavigationMenuList>
          </NavigationMenu>

          <LanguageSelector />

          <Link
            to="/cart"
            aria-label={t.shop.cartTitle}
            className="relative flex items-center p-1 text-foreground/70 transition-colors hover:text-foreground"
          >
            <ShoppingCart className="h-5 w-5" />
            {count > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {count}
              </span>
            ) : null}
          </Link>

          {!user && (
            <Button
              variant="outline"
              onClick={openLogin}
              className="rounded-sm border border-black/15 px-4 py-2 text-sm font-medium text-foreground hover:bg-foreground hover:text-background"
            >
              {t.nav.login}
            </Button>
          )}

          <Button
            onClick={orderNow}
            className="rounded-sm bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t.nav.orderNow}
          </Button>
        </div>

        {/* Mobile right cluster: cart (after login) + language + hamburger.
            display:none at md keeps it out of the desktop flex row. */}
        <div className="flex items-center gap-2 md:hidden">
          {user ? (
            <Link
              to="/cart"
              aria-label={t.shop.cartTitle}
              className="relative flex items-center p-2 text-foreground/70 transition-colors hover:text-foreground"
            >
              <ShoppingCart className="h-5 w-5" />
              {count > 0 ? (
                <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {count}
                </span>
              ) : null}
            </Link>
          ) : null}
          <LanguageSelector />
          <Sheet>
            <SheetTrigger
              render={
                <button
                  type="button"
                  aria-label={t.nav.openMenu}
                  className="rounded-sm p-2 text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
              }
            />
            <SheetContent
              side="right"
              className="flex w-[300px] flex-col bg-background"
            >
              <SheetHeader>
                <SheetTitle>{t.nav.menuTitle}</SheetTitle>
              </SheetHeader>
              <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 pb-6">
                {navLinks.map((link) =>
                  link.href ? (
                    <SheetClose
                      nativeButton={false}
                      key={link.href}
                      render={
                        <Link
                          to={link.href}
                          className="flex items-center gap-2.5 text-lg tracking-tight text-foreground"
                        >
                          {link.label}
                          {link.unread ? (
                            <UnreadDot label={t.nav.unreadMessages} />
                          ) : null}
                        </Link>
                      }
                    />
                  ) : (
                    <SheetClose
                      nativeButton={false}
                      key={link.anchor}
                      render={
                        <a
                          href={link.anchor}
                          className="text-lg tracking-tight text-foreground"
                        >
                          {link.label}
                        </a>
                      }
                    />
                  )
                )}

                <div className="mt-2 grid content-start gap-4 border-t border-black/10 pt-6">
                  <SheetClose
                    nativeButton={false}
                    render={
                      <Link
                        to="/cart"
                        className="flex items-center gap-2 text-lg tracking-tight text-foreground"
                      >
                        <ShoppingCart className="h-5 w-5" />
                        {t.shop.cartTitle}
                        {count > 0 ? (
                          <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    }
                  />
                  {user ? (
                    <>
                      <SheetClose
                        nativeButton={false}
                        render={
                          <Link
                            to="/profile"
                            className="text-lg tracking-tight text-foreground"
                          >
                            {t.nav.profile}
                          </Link>
                        }
                      />
                      <SheetClose
                        nativeButton={false}
                        render={
                          <Link
                            to="/orders"
                            className="text-lg tracking-tight text-foreground"
                          >
                            {t.shop.ordersTitle}
                          </Link>
                        }
                      />
                    </>
                  ) : null}
                </div>
              </div>
              <SheetFooter className="flex-col! gap-2 space-x-0!">
                {user ? (
                  <span className="text-sm text-muted-foreground">
                    {user.phone}
                  </span>
                ) : null}
                {user ? (
                  <SheetClose
                    render={
                      <Button
                        variant="outline"
                        onClick={logout}
                        className="rounded-sm border border-black/15 px-6 py-3 text-foreground"
                      >
                        <LogOut className="mr-1.5 h-4 w-4" />
                        {t.nav.logout}
                      </Button>
                    }
                  />
                ) : (
                  <SheetClose
                    render={
                      <Button
                        variant="outline"
                        onClick={openLogin}
                        className="rounded-sm border border-black/15 px-6 py-3 text-foreground"
                      >
                        {t.nav.login}
                      </Button>
                    }
                  />
                )}
                <SheetClose
                  render={
                    <Button
                      onClick={orderNow}
                      className="rounded-sm bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
                    >
                      {t.nav.orderNow}
                    </Button>
                  }
                />
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}

type MenuLinkProps = {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  showUnreadDot?: boolean;
};

function MenuLink({
  to,
  icon,
  title,
  description,
  showUnreadDot,
}: MenuLinkProps) {
  const t = useMessages();
  return (
    <NavigationMenuLink
      render={
        <Link
          to={to}
          className="flex col-span-1 items-start gap-3 rounded-sm p-3 transition-colors hover:bg-secondary"
        >
          <span className="mt-0.5 text-primary">{icon}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="block text-sm font-medium text-foreground">
                {title}
              </span>
              {showUnreadDot ? (
                <UnreadDot label={t.nav.unreadMessages} />
              ) : null}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          </span>
        </Link>
      }
    />
  );
}

/** Red unread indicator; the label keeps the state audible for screen readers. */
function UnreadDot({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-600" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

type MenuAnchorProps = {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
};

function MenuAnchor({ href, icon, title, description }: MenuAnchorProps) {
  return (
    <NavigationMenuLink
      render={
        <a
          href={href}
          className="flex col-span-1 items-start gap-3 rounded-sm p-3 transition-colors hover:bg-secondary"
        >
          <span className="mt-0.5 text-primary">{icon}</span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">
              {title}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          </span>
        </a>
      }
    />
  );
}
