import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { useChatUnread } from "../../lib/chat";
import { Navbar } from "./navbar";

// The mobile header must always offer the cart after login — verifying the
// link + badge without depending on Radix Sheet synthetic input (which is
// unreliable in jsdom).
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    // <Link> needs a live router instance; a plain anchor exercises the
    // same render path for this test.
    Link: ({
      to,
      children,
      ...rest
    }: React.ComponentProps<"a"> & { to: string }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => () => undefined,
    useRouter: () => ({ history: { back: () => undefined } }),
    useLocation: () => ({ pathname: mockPathname }),
  };
});

// Controls the route the Navbar believes it is on (back-chevron visibility).
let mockPathname = "/";
vi.mock("../../lib/auth", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../../lib/cart", () => ({
  useCart: vi.fn(),
}));
vi.mock("../../lib/chat", () => ({
  useChatUnread: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseCart = vi.mocked(useCart);
const mockedUseChatUnread = vi.mocked(useChatUnread);

function renderNavbar() {
  return render(
    <I18nProvider>
      <Navbar />
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockPathname = "/";
});

describe("Navbar back chevron", () => {
  it("is absent on the home route", () => {
    mockedUseAuth.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
    mockedUseCart.mockReturnValue({ count: 0 } as unknown as ReturnType<typeof useCart>);
    mockedUseChatUnread.mockReturnValue(0);
    mockPathname = "/";

    renderNavbar();

    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("appears on non-home routes with an accessible name", () => {
    mockedUseAuth.mockReturnValue({ user: null } as unknown as ReturnType<typeof useAuth>);
    mockedUseCart.mockReturnValue({ count: 0 } as unknown as ReturnType<typeof useCart>);
    mockedUseChatUnread.mockReturnValue(0);
    mockPathname = "/products";

    renderNavbar();

    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
  });
});

describe("Navbar mobile cart", () => {
  it("shows the cart link in the header when logged in", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 1, phone: "+919999999999", name: "Test" },
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCart.mockReturnValue({ count: 3 } as unknown as ReturnType<
      typeof useCart
    >);
    mockedUseChatUnread.mockReturnValue(0);

    renderNavbar();

    // More than one cart link exists (desktop nav menu, mobile header,
    // sheet) — the requirement is that the header itself carries one; count
    // >= 2 proves the icon is outside the desktop-only section too.
    const cartLinks = screen.getAllByRole("link", { name: /cart/i });
    expect(cartLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("hides the header cart link when logged out", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCart.mockReturnValue({ count: 0 } as unknown as ReturnType<
      typeof useCart
    >);
    mockedUseChatUnread.mockReturnValue(0);

    renderNavbar();

    // Only the desktop hover-menu entry remains; the mobile header and the
    // sheet carry no standalone cart link.
    const cartLinks = screen.getAllByRole("link", { name: /cart/i });
    expect(cartLinks).toHaveLength(1);
  });
});

describe("Navbar mobile menu sheet", () => {
  it("opens from the right edge (side=right)", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCart.mockReturnValue({ count: 0 } as unknown as ReturnType<
      typeof useCart
    >);
    mockedUseChatUnread.mockReturnValue(0);

    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    // jsdom does not run CSS animations; the data-side attribute plus the
    // side-conditional utilities on the portaled dialog are what determine
    // the animation direction.
    const dialog = screen.getByRole("dialog");
    expect(dialog.hasAttribute("data-open")).toBe(true);
    expect(dialog.getAttribute("data-side")).toBe("right");
    expect(dialog.className).toContain("data-[side=right]:right-0");
    expect(dialog.className).toContain(
      "data-[side=right]:data-starting-style:translate-x-[2.5rem]"
    );
  });

  it("renders the hamburger after the cart and language selector", () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 1, phone: "+919999999999", name: "Test" },
    } as unknown as ReturnType<typeof useAuth>);
    mockedUseCart.mockReturnValue({ count: 2 } as unknown as ReturnType<
      typeof useCart
    >);
    mockedUseChatUnread.mockReturnValue(0);

    renderNavbar();

    // The mobile cluster renders cart → language → hamburger, so the menu
    // trigger must be the last (rightmost) child of its flex row.
    const trigger = screen.getByRole("button", { name: "Open menu" });
    const cluster = trigger.parentElement;
    expect(cluster).not.toBeNull();
    expect(cluster?.lastElementChild).toBe(trigger);
    expect(cluster?.querySelector('a[href="/cart"]')).not.toBeNull();
    expect(cluster?.querySelector('button[role="combobox"]')).not.toBeNull();
  });
});
