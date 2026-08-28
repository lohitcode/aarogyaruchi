import type {
  FaqMessages,
  LegalDoc,
  ProductMessages,
  ReviewMessages,
} from "../types"

/**
 * English messages — the source of truth for the Messages type and the
 * fallback locale. Brand names, phone numbers, addresses, prices and units
 * are intentionally not localized anywhere in this file.
 */
export const en = {
  meta: {
    homeTitle: "Aarogya Ruchi - Healthy & Delicious Meals",
    homeDescription:
      "Fresh, healthy, and delicious home-style meals delivered to your doorstep.",
    productsTitle: "Shop — Aarogya Ruchi",
    productsDescription:
      "Explore our range of healthy, delicious products made with the finest natural ingredients.",
    productTitle: (name: string) => `${name} — Aarogya Ruchi`,
    privacyTitle: "Privacy Policy — Aarogya Ruchi",
    termsTitle: "Terms of Service — Aarogya Ruchi",
    deleteAccountTitle: "Request account deletion — Aarogya Ruchi",
    notFoundTitle: "Page not found — Aarogya Ruchi",
  },

  language: {
    /** Spoken only when interacting with the language selector. */
    selectorLabel: "Change language",
    english: "English",
    telugu: "తెలుగు",
    hindi: "हिन्दी",
  },

  nav: {
    products: "Products",
    support: "Support",
    profile: "My Profile",
    menu: "Menu",
    groupShop: "Shop & Orders",
    groupCompany: "Company",
    productsDesc: "Browse the full fresh catalog",
    supportDesc: "Chat with our team about anything",
    unreadMessages: "Unread messages from support",
    storyDesc: "Who we are and how we cook",
    benefitsDesc: "Why Aarogya Ruchi, plainly",
    reviewsDesc: "What customers say about us",
    faqDesc: "Orders, delivery, payments — answered",
    cartDesc: "Review your items and checkout",
    ordersDesc: "Track deliveries and history",
    profileDesc: "Your details and delivery address",
    story: "Story",
    benefits: "Benefits",
    reviews: "Reviews",
    faq: "FAQ",
    login: "Login",
    logout: "Logout",
    orderNow: "Order Now",
    openMenu: "Open menu",
    back: "Back",
    menuTitle: "Navigation Menu",
    menuDescription: "Site navigation links",
  },

  hero: {
    eyebrow: "Fresh · Natural · Homemade",
    headline: "Taste the goodness of",
    words: ["Health.", "Flavor.", "Nature."],
    subheading:
      "Fresh, nutritious meals and snacks crafted with the finest natural ingredients. Delivered to your doorstep.",
    buyNow: "Buy Now",
    learnMore: "Learn More",
  },

  about: {
    label: "OUR STORY",
    heading:
      "Healthy, honest food — rooted in Indian tradition, made fresh every day.",
    imageAlt: "A bowl of fresh Aarogya Ruchi sprouts",
    items: {
      tradition: {
        title: "Rooted in Tradition",
        text: "Aarogya Ruchi began in the kitchens we grew up in — where ragi jav was a morning ritual and pesalu sprouts an everyday snack. We draw on generations of South Indian and Ayurvedic home cooking, pairing time-honoured ingredients like finger millet, millets and lentils with a clear-eyed focus on real nutrition.",
      },
      fresh: {
        title: "Made Fresh, Never Packaged",
        text: "Nothing here comes off a factory line. Our ragi drinks, sprouts and seasonal juices are prepared in small batches each morning using whole, natural ingredients — no preservatives, no artificial colours, no refined sugar. What you eat today was made today.",
      },
      closeToHome: {
        title: "Goodness, Close to Home",
        text: "From parks and gyms across the Bachupally locality to doorstep delivery, we make healthy eating the easy choice. Order in a few taps, pay cash on delivery, and follow your order through your account — honest food that fits the way modern life actually works.",
      },
    },
  },

  benefits: {
    label: "WHY AAROGYA",
    heading: "Health is wealth.",
    subheading:
      "Our products are designed to make healthy eating effortless and enjoyable.",
    items: {
      natural: {
        title: "100% Natural",
        description:
          "Whole ingredients you can pronounce — sprouted ragi, millets, lentils and fresh fruit. No preservatives, no artificial colours, no refined sugar. Just real food, made the day you eat it.",
      },
      daily: {
        title: "Made Fresh Daily",
        description:
          "Everything is prepared in small batches each morning — ragi drinks, sprouts and cold-pressed juices — so what reaches you is genuinely fresh, never sitting on a shelf.",
      },
      nutrients: {
        title: "Rich in Nutrients",
        description:
          "Low-GI millets and sprouted grains, high-fibre sprouts and seasonal fruit — formulated to nourish without the sugar crash, and satisfying enough to become a daily habit.",
      },
    },
  },

  ingredients: {
    label: "INGREDIENTS",
    heading: "Ingredients you can trust.",
    body: "We believe in full transparency. Every product label lists exactly what goes inside — no hidden additives, no chemical preservatives, no refined sugars. Just real food, the way nature intended.",
    quote:
      "If your grandmother wouldn't recognize it as food, we don't use it.",
  },

  popular: {
    label: "OUR PRODUCTS",
    heading: "Popular products.",
    viewAll: "View all products",
  },

  reviewsSection: {
    label: "REVIEWS",
    heading: "What our customers say.",
    scrollLeft: "Scroll reviews left",
    scrollRight: "Scroll reviews right",
  },

  storeLocator: {
    label: "FIND US",
    heading: "Find us near you.",
    loadingMap: "Loading map...",
    cardTitle: "Order online",
    cardBody:
      "We currently deliver fresh to the Bachupally locality. Order directly from us and pay cash on delivery when it arrives.",
    cta: "Shop Now",
  },

  stats: {
    label: "BY THE NUMBERS",
    items: {
      products: { label: "Products", value: "9" },
      natural: { label: "Natural", value: "100%" },
      customers: { label: "Happy customers", value: "2,000+" },
      basedIn: { label: "Based in", value: "Hyderabad" },
    },
  },

  promo: {
    eyebrow: "Refer & earn",
    heading: "A surprise goodie, on us.",
    body: "Your first order comes with a free surprise treat. Refer a friend and you'll each get one too — we add it while preparing your order, so it shows up once your order is confirmed.",
    cta: "Order Now",
  },

  faqSection: {
    label: "FAQ",
    heading: "Frequently asked questions.",
  },

  productsPage: {
    label: "SHOP",
    title: "Our products.",
    subtitle:
      "Explore our range of healthy, delicious products made with the finest natural ingredients.",
    categoriesAria: "Product categories",
    categories: {
      all: "All",
      meals: "Meals",
      snacks: "Snacks",
      drinks: "Drinks",
    },
  },

  productDetail: {
    size: "Size",
    add: "Add",
    addToCart: "Add to Cart",
    added: "Added",
    increaseQuantity: "Increase quantity",
    decreaseQuantity: "Decrease quantity",
    tabs: {
      details: "Details",
      ingredients: "Ingredients",
      nutrition: "Nutrition",
    },
    nutritionLabels: {
      calories: "Calories",
      protein: "Protein",
      carbs: "Carbs",
      fat: "Fat",
      fiber: "Fiber",
    },
    similarLabel: "YOU MIGHT ALSO LIKE",
    similarHeading: "More from this range.",
    notFoundTitle: "Product not found",
    notFoundBody: "The product you're looking for doesn't exist.",
  },

  auth: {
    phoneTitle: "Login with WhatsApp",
    otpTitle: "Enter the code",
    profileTitle: "Complete your sign up",
    phoneDescription:
      "Enter a mobile number to receive a one-time password on WhatsApp.",
    otpDescription: (digits: string) =>
      `Enter the 6-digit code sent to +91 ${digits}.`,
    profileDescription:
      "We need a few details so we can prepare and deliver your first order.",
    phonePlaceholder: "98765 43210",
    continueToCode: "Send code",
    previewNote:
      "We'll send a one-time password to your WhatsApp number.",
    verify: "Verify code",
    changeNumber: "Change number",
    wrongCode: "That code is incorrect or has expired.",
    sending: "Sending…",
    verifying: "Verifying…",
    sendFailed: "Could not send the code. Please try again.",
    verifyFailed: "Verification failed. Please try again.",
    fullName: "Full name",
    namePlaceholder: "Your name",
    completeSignup: "Complete sign up",
    legalNote: {
      lead: "By continuing you agree to our",
      terms: "Terms",
      and: "and",
      privacy: "Privacy Policy",
      trailing: ".",
    },
  },

  shop: {
    cartTitle: "Your Cart",
    cartDescription: "Review your cart and proceed to checkout.",
    emptyCart: "Your cart is empty",
    emptyCartHint: "Add some healthy goodness to get started.",
    browseProducts: "Browse products",
    decrease: "Decrease quantity",
    increase: "Increase quantity",
    remove: "Remove item",
    total: "Total",
    checkout: "Proceed to checkout",
    cartCodNote: "Payment is cash on delivery.",
    continueShopping: "Continue shopping",
    checkoutTitle: "Checkout",
    checkoutDescription: "Confirm your address and place your order.",
    loginToCheckout: "Please log in to checkout.",
    deliveryAddress: "Delivery address",
    addressLabel: "Label",
    addressLabelHint: "Home, Office…",
    locality: "Locality",
    selectLocality: "Select your locality",
    addressLine: "Address",
    addressLineHint: "Flat/House no, street, area",
    landmark: "Landmark",
    instructions: "Delivery instructions (optional)",
    useMyLocation: "Use my location",
    locating: "Locating…",
    gpsDenied: "Location permission denied — type your address and confirm it below.",
    yourLocation: "Your location",
    confirmLocation: "I confirm this location is accurate and findable",
    saveAddress: "Save address",
    cancel: "Cancel",
    addAddress: "Add a new address",
    loadAddressesFailed: "Could not load your addresses.",
    saveAddressFailed: "Could not save the address.",
    orderSummary: "Order summary",
    deliveryOn: (date: string) => `Delivery on ${date}`,
    cashOnDelivery: "Cash on delivery",
    placeCodOrder: "Place order · Pay on delivery",
    placing: "Placing order…",
    finalTotalNote: "Final total is confirmed by the kitchen before dispatch.",
    quoteFailed: "Could not confirm prices. Please refresh.",
    placeOrderFailed: "Could not place the order. Please try again.",
    orderPlacedTitle: "Order placed!",
    orderPlacedDescription: "Your order is in. We'll start preparing it fresh.",
    codReminder: "Please keep the exact amount ready — payment is cash on delivery.",
    viewOrders: "View my orders",
    ordersTitle: "My Orders",
    ordersDescription: "Track your orders and deliveries.",
    loginToOrders: "Log in to see your orders.",
    loading: "Loading…",
    unavailable: "Currently unavailable",
    from: "from",
    loadProductsFailed: "Couldn't load products right now. Please refresh.",
    emptyCatalog: "No products available yet.",

    noOrders: "You haven't placed any orders yet.",
    loadOrdersFailed: "Could not load your orders.",
    orderDetailTitle: "Order details",
    orderDetailDescription: "Follow your order from kitchen to doorstep.",
    loadOrderFailed: "Could not load this order.",
    backToOrders: "Back to orders",
    liveTracking: "Live tracking",
    partnerNearby: "Your delivery partner is on the way",
    lastSeenMinutes: (minutes: number) => `Last seen ${minutes} min ago`,
    partnerLabel: "Delivery partner",
    timeline: "Progress",
    items: "Items",
    cancelOrder: "Cancel order",
    cancelling: "Cancelling…",
    cancelFailed: "Could not cancel the order — it may already be in preparation.",
    cancelNote: "Orders can be cancelled until the kitchen starts preparing them.",
    status: {
      placed: "Placed",
      confirmed: "Confirmed",
      preparing: "Preparing",
      ready: "Ready",
      assigned: "Assigned",
      picked_up: "Picked up",
      out_for_delivery: "Out for delivery",
      delivered: "Delivered",
      cancelled: "Cancelled",
      delivery_failed: "Delivery failed",
    },
  },


  profile: {
    title: "My Profile",
    description: "Your account details and delivery address.",
    fullName: "Full name",
    phone: "Phone",
    ordersPlaced: "Orders",
    deliveryAddress: "Delivery address",
    addressLabel: "Address",
    addressPlaceholder: "Flat/House no, street, area, landmark…",
    save: "Save",
    saved: "Saved.",
    saveFailed: "Could not save. Please try again.",
    editName: "Edit name",
    editAddress: "Edit address",
    noAddress: "No address saved yet.",
    noLocation: "No GPS location saved for this address.",
    locationOnMap: "Location on map",
    locating: "Finding your location…",
    locationDenied: "Location unavailable — you can still save the address.",
    locationCaptured: "Location captured:",
    recapture: "Update location",
    ordersNote: (count: number) => `You have placed ${count} order with us.`,
    loginFirst: "Log in to see your profile.",
    gateTitle: "Complete your details",
    gateBody: "We need your name and delivery address to prepare and deliver your orders. This only takes a moment.",
    gateSubmit: "Save and continue",
    gateNote: "You can update these anytime from My Profile.",
    saving: "Saving…",
  },
  support: {
    title: "Support",
    description: "Chat with the Aarogya Ruchi team.",
    youAre: "You are chatting as",
    youLabel: "You",
    supportLabel: "Support",
    messagePlaceholder: "Type your message…",
    send: "Send",
    sendFailed: "Could not send the message. Please try again.",
    loadFailed: "Could not load the conversation.",
    emptyThread: "No messages yet — say hello and we'll reply here.",
    enableNotifications: "Get notified about replies",
    notificationsOn: "Notifications on",
    notificationsBlocked: "Notifications blocked in your browser settings",
    loginFirst: "Log in to chat with support.",
    loginButton: "Log in",
    replyTime: "We usually reply within a few minutes during delivery hours",
  },

  footer: {
    tagline:
      "Healthy, delicious meals crafted with love and the finest natural ingredients.",
    ownedBy: (operator: string) => `Owned and operated by ${operator}`,
    shopTitle: "Shop",
    shop: {
  notifications: {
    title: "Turn on notifications",
    body: "Get order updates and support replies on this device.",
    enable: "Enable notifications",
    enabling: "Enabling…",
    dismiss: "Dismiss notification nudge",
    blockedTitle: "Notifications are blocked",
    blockedBody:
      "Allow notifications for this site in your browser settings to get order updates and support replies.",
  },

      all: "All Products",
      meals: "Meals",
      snacks: "Snacks",
      drinks: "Drinks",
    },
    companyTitle: "Company",
    company: {
      about: "About Us",
      benefits: "Benefits",
      reviews: "Reviews",
      faq: "FAQ",
    },
    legalTitle: "Legal",
    legal: {
      terms: "Terms of Service",
      privacy: "Privacy Policy",
      delete: "Delete Account",
    },
    rights: (year: number, brand: string) =>
      `© ${year} ${brand}. All rights reserved.`,
    terms: "Terms",
    privacy: "Privacy",
  },

  chat: {
    launcher: "Open the Aarogya Ruchi Assistant",
    title: "Aarogya Ruchi Assistant",
    subtitle: "Product help — answers in your language",
    placeholder: "Ask about our products, delivery, timings...",
    send: "Send message",
    clear: "Clear conversation",
    close: "Close chat",
    retry: "Retry",
    offline:
      "You appear to be offline. Please check your connection and try again.",
    rateLimited:
      "You've sent too many messages. Please wait a little and try again.",
    providerError:
      "The assistant is unavailable right now. Please try again in a moment.",
    inputTooLong: "Please keep your message under 1,000 characters.",
    fallbackNotice:
      "This topic may be answered in English while we improve other languages.",
    welcome:
      "Hello! Ask me anything about our ragi drinks, sprouts, juices, delivery area or ordering.",
    disclaimer:
      "This assistant helps with products and ordering questions. It cannot place or track orders.",
  },

  catalog: {
    products: {
      "ragi-jawa": {
        name: "Ragi Jawa",
        description:
          "Freshly prepared ragi drink, usually served warm. Traditional Karnataka health drink rich in calcium and iron.",
        ingredients: ["Finger millet", "Water", "Jaggery", "Cardamom"],
        tags: ["Calcium-Rich", "Traditional", "Warm Drink"],
      },
      "ragi-malt-sweet": {
        name: "Ragi Malt (Sweet)",
        description:
          "Classic sweet ragi malt drink made from sprouted finger millet. High calcium health drink.",
        ingredients: ["Sprouted ragi", "Jaggery", "Milk", "Cardamom"],
        tags: ["Calcium-Rich", "Sprouted", "Sweet"],
      },
      "ragi-malt-salted": {
        name: "Ragi Malt (Salted)",
        description:
          "Savory version of the traditional ragi malt. Perfect for those who prefer less sweet.",
        ingredients: ["Sprouted ragi", "Salt", "Buttermilk", "Cumin"],
        tags: ["Calcium-Rich", "Sprouted", "Savory"],
      },
      "mixed-sprouts": {
        name: "Mixed Sprouts",
        description:
          "Healthy combination of sprouted green gram, chickpeas, and other lentils. Protein-rich snack.",
        ingredients: [
          "Green gram sprouts",
          "Chickpea sprouts",
          "Moath sprouts",
          "Onion",
          "Lemon",
          "Spices",
        ],
        tags: ["High-Protein", "Fresh", "Sprouted"],
      },
      "green-gram-sprouts": {
        name: "Green Gram Sprouts",
        description:
          "Pesalu sprouts - protein-rich green gram sprouts. Traditional Andhra healthy snack.",
        ingredients: ["Green gram sprouts", "Coconut", "Mustard seeds", "Lemon"],
        tags: ["High-Protein", "Pesalu", "Traditional"],
      },
      "orange-juice": {
        name: "Orange Juice",
        description:
          "Fresh seasonal orange juice. No added sugar or preservatives. Pure vitamin C boost.",
        ingredients: ["Fresh oranges", "Amla", "Optional: Chia seeds"],
        tags: ["Fresh", "Seasonal", "Vitamin C"],
      },
      "watermelon-juice": {
        name: "Watermelon Juice",
        description:
          "Refreshing watermelon juice. Perfect summer drink with natural sweetness.",
        ingredients: ["Fresh watermelon", "Mint leaves", "Black salt"],
        tags: ["Refreshing", "Seasonal", "Hydrating"],
      },
      "mosambi-juice": {
        name: "Mosambi Juice",
        description:
          "Sweet lime juice with a hint of salt. Hydrating and refreshing citrus drink.",
        ingredients: ["Fresh mosambi", "Black salt", "Chat masala"],
        tags: ["Refreshing", "Vitamin C", "Seasonal"],
      },
      "sprout-salad": {
        name: "Sprout Salad",
        description:
          "Fresh sprout mix with onions, tomatoes, cucumber, lemon, and spices. Healthy chaat-style salad.",
        ingredients: [
          "Mixed sprouts",
          "Onion",
          "Tomato",
          "Cucumber",
          "Lemon juice",
          "Green chutney",
        ],
        tags: ["Fresh", "Chaat-Style", "High-Fiber"],
      },
    } satisfies Record<string, ProductMessages>,
    faqs: {
      "faq-001": {
        question: "How do I place an order?",
        answer:
          "The current website uses a preview code so you can test the planned flow without sending a WhatsApp message. After Meta approval, the code will be delivered to the WhatsApp number you enter. First-time customers provide only their name and delivery location — no secondary number, email or password.",
      },
      "faq-002": {
        question: "How do you take payment?",
        answer:
          "Cash on delivery only. We do not accept online payments — there is no card, UPI or wallet checkout on this site, and we never collect your payment details. Simply pay our delivery person in cash when your order arrives.",
      },
      "faq-003": {
        question: "When will my order arrive? (Daily cutoff)",
        answer:
          "Everything is made fresh in small batches. Order by 11:59 PM for delivery the next morning. At 12:00 AM a new daily batch begins, so an order placed then is scheduled for the following morning. All dates are calculated in India Standard Time.",
      },
      "faq-004": {
        question: "Where do you deliver?",
        answer:
          "Right now we deliver only in the Bachupally area of Hyderabad and nearby streets. We're a small, fresh-prep kitchen and we'll expand to more localities as we grow — orders outside the active delivery area may be declined.",
      },
      "faq-005": {
        question: "Do you offer discounts or coupon codes?",
        answer:
          "No percentage discounts or coupons. Instead, your first order includes a free surprise goodie (for example, a complimentary ragi malt with a sprout bowl), and when you refer a friend you both receive a goodie. Goodies are added while we prepare your order, so they appear in your order summary once it's confirmed — not at checkout.",
      },
      "faq-006": {
        question: "Can I cancel an order? What about refunds?",
        answer:
          "You can request cancellation before 11:59 PM IST on the date you order, provided preparation has not started. After the batch closes, cancellation may not be possible. Delivered food can't be returned for safety reasons, but if anything is missing or incorrect, contact us on the delivery day. Since we take no payment online, there are no online refunds to process.",
      },
      "faq-007": {
        question: "How should I store my order?",
        answer:
          "Ragi drinks are best enjoyed warm and fresh. Sprouts and salads should be refrigerated and eaten within a day of delivery. Fresh juices should be kept chilled and finished the same day for the best taste and nutrition.",
      },
      "faq-008": {
        question: "Are your products suitable for diabetics?",
        answer:
          "Many of our items use low-GI ingredients like ragi, millets and sprouted lentils, and our juices contain no added sugar. Everyone's needs differ, though, so please check with your doctor before changing a medical diet.",
      },
      "faq-009": {
        question: "How do I track my order or reach your team?",
        answer:
          "Order tracking will be available in your account. WhatsApp login verification will be enabled after our Meta integration is approved; order notifications may be added later with your consent. For help, call +91 89781 38585 between 9 AM and 6 PM IST.",
      },
    },
    reviews: {
      "review-001": {
        text: "The Ragi Jawa tastes exactly like my grandmother used to make — warm, earthy and comforting. It's my everyday morning ritual before the walk now, and the calcium and iron are a bonus I can actually feel.",
        product: "Ragi Jawa",
      },
      "review-002": {
        text: "Grabbed the Mixed Sprouts after a gym session and was hooked. Fresh, properly spiced and genuinely filling — far better than the packaged snacks I used to reach for. Ordering directly is effortless.",
        product: "Mixed Sprouts",
      },
      "review-003": {
        text: "My kids are fussy, but they ask for the sweet Ragi Malt themselves now. Knowing it's sprouted finger millet with no refined sugar makes me happy to say yes. Delivery to Bachupally was bang on time.",
        product: "Ragi Malt (Sweet)",
      },
      "review-004": {
        text: "The Sprout Salad is my go-to lunch — light, crunchy, and the chaat seasoning hits the spot. Freshness is consistent every single order. I just wish they delivered a little later in the evening.",
        product: "Sprout Salad",
      },
      "review-005": {
        text: "Fresh Mosambi juice with no added sugar — exactly what I wanted for my diabetic father. You can tell it's real fruit, not concentrate. It's become a weekly order for the whole family.",
        product: "Mosambi Juice",
      },
      "review-006": {
        text: "Green gram sprouts the way we make them at home in Andhra — pesalu done right. Clean, hygienic and seasoned perfectly. Aarogya Ruchi has quietly become a staple in my diet.",
        product: "Green Gram Sprouts",
      },
    },
  },

  legal: {
    privacy: {
      eyebrow: "Legal",
      title: "Privacy Policy",
      lastUpdated: "Last updated: August 2026",
      contactLabels: {
        operator: "Business operator:",
        email: "Email:",
        phone: "Phone:",
        address: "Address:",
        grievance: "Grievance Officer:",
      },
      sections: [
        {
          heading: "",
          blocks: [
            {
              kind: "p",
              text: "{brand}, a sole proprietorship owned and operated by {operator} (\"we,\" \"our,\" or \"us\"), is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose and safeguard information when you use our website and progressive web application.",
            },
          ],
        },
        {
          heading: "1. Information We Collect",
          blocks: [
            { kind: "h3", text: "Personal Information" },
            {
              kind: "p",
              text: "Because we run on cash-on-delivery and plan to use WhatsApp sign-in, we keep what we collect to a minimum. When production accounts and ordering are enabled, we will collect only:",
            },
            {
              kind: "ul",
              items: [
                "Your name",
                "Your WhatsApp number (used as your account and login)",
                "Your home / delivery location",
                "Your orders and delivery history",
                "Referral details needed to credit our referral goodie (your number and, if you were referred, who referred you)",
              ],
            },
            {
              kind: "p",
              text: "Current preview: Production accounts and WhatsApp OTP delivery are not yet enabled. Information entered in the preview login is stored locally in your browser and is not sent to Meta or our production account system.",
            },
            {
              kind: "p",
              text: "We do not require your email address, password or secondary phone number. While payment remains cash on delivery, we also do not collect card, UPI or banking credentials through the website.",
            },
            { kind: "h3", text: "Automatically Collected Information" },
            {
              kind: "p",
              text: "Our hosting and security systems may automatically receive:",
            },
            {
              kind: "ul",
              items: [
                "IP address and request timestamps",
                "Browser, device and operating-system information",
                "Security, error and performance logs",
              ],
            },
          ],
        },
        {
          heading: "2. How We Use Your Information",
          blocks: [
            { kind: "p", text: "We use the collected information to:" },
            {
              kind: "ul",
              items: [
                "Process and deliver your orders",
                "Send a WhatsApp OTP when you request login after production authentication is enabled",
                "Communicate with you about orders when that feature is enabled",
                "Run our referral program and add first-order and referral goodies",
                "Send promotional messages (with your consent)",
                "Improve our app and services",
                "Prevent fraud and ensure security",
                "Comply with legal obligations",
              ],
            },
          ],
        },
        {
          heading: "3. Data Sharing and Disclosure",
          blocks: [
            {
              kind: "p",
              text: "We do not sell your personal data. We may share information with:",
            },
            {
              kind: "ul",
              items: [
                "Service Providers: Delivery partners, cloud hosting providers and delivery partners, limited to the information necessary to operate and fulfil the service",
                "Operational analytics: Limited technical data used to secure and improve the service",
                "Legal Requirements: When required by law or to protect our rights",
                "WhatsApp Business Platform: This integration is not yet active. After it is enabled, requesting a login code will cause your phone number, the authentication message and delivery metadata to be processed through Meta Platforms, Inc. Future order or marketing messages will be used only for the disclosed purpose and with the applicable consent.",
              ],
            },
          ],
        },
        {
          heading: "4. Data Security",
          blocks: [
            {
              kind: "p",
              text: "We implement industry-standard security measures including encryption, secure servers, and access controls to protect your data. However, no method of transmission over the internet is 100% secure.",
            },
          ],
        },
        {
          heading: "5. Data Retention",
          blocks: [
            {
              kind: "p",
              text: "Preview login information remains in your browser until you log out, clear site data or request deletion through the available controls. After production launch, we will retain account information while your account is active and for only as long afterward as needed for security, dispute handling and legal obligations. Production OTP records will expire after five minutes and be removed after successful verification. Order and transaction records may be retained for the period required by applicable tax, food-safety and consumer laws.",
            },
          ],
        },
        {
          heading: "6. Your Rights",
          blocks: [
            { kind: "p", text: "You have the right to:" },
            {
              kind: "ul",
              items: [
                "Access your personal data",
                "Correct inaccurate information",
                "Request deletion of your data",
                "Opt-out of marketing communications",
                "Withdraw consent at any time",
              ],
            },
            {
              kind: "p",
              text: "These rights are provided under the Digital Personal Data Protection Act, 2023 (DPDP Act). To exercise any of them, contact our Grievance Officer at {email}. We will acknowledge your request and respond within the time required by law.",
            },
          ],
        },
        {
          heading: "7. Children's Privacy",
          blocks: [
            {
              kind: "p",
              text: "Our service is not intended for children under 18. We do not knowingly collect information from children. If you believe a child has provided us with personal information, please contact us immediately.",
            },
          ],
        },
        {
          heading: "8. Changes to This Policy",
          blocks: [
            {
              kind: "p",
              text: "We may update this policy periodically. We will publish the revised policy and update the date shown above. Where required, we will provide an additional notice or request fresh consent.",
            },
          ],
        },
        {
          heading: "9. WhatsApp & Messaging Services",
          blocks: [
            { kind: "h3", text: "9.1 WhatsApp Marketing" },
            {
              kind: "p",
              text: "Promotional WhatsApp messages are not part of login consent. If we introduce them later, we will ask for separate, optional consent and keep a record of when and how it was provided. You will be able to opt out at any time by replying \"STOP\" to any WhatsApp message or contacting us at {email}.",
            },
            {
              kind: "h3",
              text: "9.2 Phone Number Authentication (OTP)",
            },
            {
              kind: "p",
              text: "WhatsApp OTP delivery is not active in the current preview. When production authentication is enabled, entering your number and selecting \"Send code via WhatsApp\" will request and consent to one authentication message for that login attempt. The production OTP will be:",
            },
            {
              kind: "ul",
              items: [
                "Valid for five minutes from generation",
                "Single-use only",
                "Invalidated after successful verification",
                "Rate-limited to protect your number from misuse",
              ],
            },
            {
              kind: "h3",
              text: "9.3 Message Frequency & Your Choices",
            },
            {
              kind: "p",
              text: "Once enabled, authentication messages will be sent only when requested. Future service or promotional messages will depend on the relevant order or consent: you can opt out of marketing without losing account access; opting out of marketing does not block a login OTP you request; and we will honour WhatsApp opt-out requests.",
            },
            {
              kind: "h3",
              text: "9.4 WhatsApp Business Platform (Meta)",
            },
            {
              kind: "p",
              text: "We plan to use the WhatsApp Business Platform operated by Meta Platforms, Inc. for requested authentication messages. The integration is not active in the current preview. Once enabled, and if additional messaging is later introduced, Meta will process the following for messages you request or consent to: your phone number, the content of messages you send and receive, message delivery and read status, and timestamps and related message metadata.",
            },
            {
              kind: "p",
              text: "Meta processes this information to operate and secure the WhatsApp Business Platform. Meta's handling of the data is governed by its terms and privacy policy. We retain related information only as long as necessary for authentication, security, support and legal compliance. Marketing opt-out does not prevent you from requesting a future login code.",
            },
          ],
        },
        {
          heading: "10. Contact Us",
          blocks: [
            {
              kind: "p",
              text: "For any questions about this Privacy Policy or to exercise your rights, please contact us:",
            },
            { kind: "contact" },
          ],
        },
      ],
    } satisfies LegalDoc,
    terms: {
      eyebrow: "Legal",
      title: "Terms of Service",
      lastUpdated: "Last updated: August 2026",
      contactLabels: {
        operator: "Business operator:",
        email: "Email:",
        phone: "Phone:",
        address: "Address:",
        grievance: "Grievance Officer:",
      },
      sections: [
        {
          heading: "",
          blocks: [
            {
              kind: "p",
              text: "Welcome to Aarogya Ruchi (\"we,\" \"us,\" or \"Aarogya Ruchi\"). By visiting our website or placing an order with us, you agree to these Terms of Service (\"Terms\"). We offer freshly prepared, healthy food for delivery on a cash-on-delivery basis in our service area.",
            },
            {
              kind: "p",
              text: "{brand} is a sole proprietorship owned and operated by {operator}, with its business address at {address}.",
            },
          ],
        },
        {
          heading: "1. Accounts & Sign-up",
          blocks: [
            {
              kind: "p",
              text: "The customer account flow is currently a website preview. It lets you test phone-number sign-in locally but does not send a WhatsApp message or create a production account. When production login is enabled, the only sign-in method will be a one-time passcode sent to the WhatsApp number you enter. We will not use email addresses or passwords for login.",
            },
            {
              kind: "p",
              text: "First-time customers. The first time you sign up, we ask for a few details so we can prepare and deliver your order: your full name and delivery location (area, landmark and address). We do not require an email address, password or secondary phone number. You agree to provide accurate, current information and to keep it up to date.",
            },
            {
              kind: "p",
              text: "In preview mode, the information you enter is stored only in your browser. Once production login is enabled, selecting Send code will request one WhatsApp verification message. Login will not enrol you in promotional messaging; any future marketing consent will be separate and optional.",
            },
          ],
        },
        {
          heading: "2. Orders, Fresh Preparation & the Daily Cutoff",
          blocks: [
            {
              kind: "p",
              text: "All our food is prepared fresh in small batches — nothing is pre-packaged or held on a shelf. Because of this, orders are not real-time and we work on a daily cutoff: place your order by 11:59 PM IST to receive it the next morning; at 12:00 AM IST a new daily order batch begins, and an order placed at or after that time is scheduled for the following morning.",
            },
            {
              kind: "p",
              text: "Your exact scheduled delivery date will be displayed before you place the order. All cutoff and delivery dates use the Asia/Kolkata time zone. All orders are subject to ingredient availability. We may limit quantities or pause items when demand exceeds what we can make fresh on a given day.",
            },
          ],
        },
        {
          heading: "3. Pricing & Payment (Cash on Delivery Only)",
          blocks: [
            {
              kind: "p",
              text: "Prices are listed in Indian Rupees (INR) and include applicable taxes. We do not accept online payments through this website — there is no card, UPI, wallet or net-banking checkout, and we do not collect any payment information from you online.",
            },
            {
              kind: "p",
              text: "Payment is cash on delivery (COD) only: please pay the exact order amount in cash to our delivery person when your order arrives. Please ensure someone is available at the delivery address to receive the order and make the payment.",
            },
          ],
        },
        {
          heading: "4. Delivery Area",
          blocks: [
            {
              kind: "p",
              text: "We currently deliver only to the Bachupally, Hyderabad locality and nearby streets. We plan to expand to more areas over time; until then, orders with addresses outside our current delivery area may be declined. Delivery times are estimates and may vary with traffic, weather and order volume.",
            },
          ],
        },
        {
          heading: "5. Referral Program & First-order Goodie",
          blocks: [
            {
              kind: "p",
              text: "We do not run percentage discounts or coupon codes. Instead: your first order includes a free surprise treat chosen by us based on what's fresh that day (for example, a complimentary ragi malt with a sprout bowl); and when someone you refer places their first order, both of you receive a free goodie.",
            },
            {
              kind: "p",
              text: "Goodies are assigned while we process your order, so they are not shown at checkout — they appear in your order summary once your order is confirmed. Goodies carry no cash value, cannot be exchanged for cash, are non-transferable, depend on availability, and may be changed or discontinued at our discretion.",
            },
          ],
        },
        {
          heading: "6. Cancellations, Returns & Quality",
          blocks: [
            {
              kind: "p",
              text: "You can request cancellation before 11:59 PM IST on the date the order is placed, provided preparation has not started. After the daily batch closes, cancellation may not be possible because ingredients and preparation may already have been committed.",
            },
            {
              kind: "p",
              text: "Because our products are freshly prepared and perishable, delivered items cannot be returned for safety and hygiene reasons. If anything is missing, incorrect or not up to standard, please contact us on the day of delivery and we will review the issue. As we take no payment online, there are no online refunds to process.",
            },
          ],
        },
        {
          heading: "7. Acceptable Use",
          blocks: [
            {
              kind: "p",
              text: "You agree to use our service lawfully, to provide truthful delivery and contact details, and not to misuse the website, place fraudulent or bad-faith orders, or interfere with its operation.",
            },
          ],
        },
        {
          heading: "8. Third-Party Services (Maps & Messaging)",
          blocks: [
            {
              kind: "p",
              text: "Our website may use maps for location display. WhatsApp production authentication is not yet enabled. When it is enabled, we intend to use the WhatsApp Business Platform operated by Meta Platforms, Inc. to deliver verification codes. See our Privacy Policy for the information that will be processed when this feature is activated.",
            },
          ],
        },
        {
          heading: "9. Intellectual Property",
          blocks: [
            {
              kind: "p",
              text: "All content on this website — including our name, logo, images and text — is owned by Aarogya Ruchi and protected by applicable intellectual-property laws. Map and messaging content remain the property of their respective providers.",
            },
          ],
        },
        {
          heading: "10. Limitation of Liability",
          blocks: [
            {
              kind: "p",
              text: "Our service is provided on an \"as available\" basis. To the fullest extent permitted by law, we are not liable for indirect, incidental or consequential damages, or for delays or issues caused by factors outside our reasonable control.",
            },
          ],
        },
        {
          heading: "11. Governing Law & Grievance Officer",
          blocks: [
            {
              kind: "p",
              text: "These Terms are governed by the laws of India, and any disputes are subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana. In line with the Digital Personal Data Protection Act, 2023, the Grievance Officer is {operator} and can be reached at {email} or {phone} for privacy, consumer or data concerns. The correspondence address is {address}.",
            },
          ],
        },
        {
          heading: "12. Changes to These Terms",
          blocks: [
            {
              kind: "p",
              text: "We may update these Terms from time to time. We will note the \"Last updated\" date above, and your continued use of our service after a change means you accept the revised Terms.",
            },
          ],
        },
        {
          heading: "13. Contact",
          blocks: [
            {
              kind: "p",
              text: "Questions about these Terms? Reach us at {email} or {phone} (9 AM–6 PM IST). Our business address is {address}.",
            },
          ],
        },
      ],
    } satisfies LegalDoc,
    deleteAccount: {
      eyebrow: "Account",
      title: "Request account deletion",
      lastUpdated: "",
      contactLabels: {
        operator: "Business operator:",
        email: "Email:",
        phone: "Phone:",
        address: "Address:",
        grievance: "Grievance Officer:",
      },
      sections: [
        {
          heading: "",
          blocks: [
            {
              kind: "p",
              text: "You can request the deletion of your account and all associated data from Aarogya Ruchi. This action is permanent and cannot be undone.",
            },
          ],
        },
        {
          heading: "What will be deleted:",
          blocks: [
            {
              kind: "ul",
              items: [
                "Your account information (name, WhatsApp number and delivery location)",
                "Saved delivery addresses",
                "Order history",
                "Referral details linked to your account",
                "App preferences and settings",
              ],
            },
          ],
        },
        {
          heading: "What may be retained:",
          blocks: [
            {
              kind: "ul",
              items: [
                "Transaction records retained for the period required by applicable law",
                "Anonymized analytics data",
              ],
            },
          ],
        },
        {
          heading: "How to request deletion:",
          blocks: [
            {
              kind: "p",
              text: "Option 1 — Email request: send an email to {email} with the subject line \"Account Deletion Request\" and include your registered WhatsApp number.",
            },
            {
              kind: "p",
              text: "Option 2 — Phone request: call us at {phone} during business hours (9 AM – 6 PM IST).",
            },
          ],
        },
        {
          heading: "Processing Time",
          blocks: [
            {
              kind: "p",
              text: "We will process your deletion request within 30 days and confirm through the contact channel you used. You may be asked to verify your identity before the request is processed.",
            },
          ],
        },
        {
          heading: "Contact Us",
          blocks: [
            {
              kind: "p",
              text: "If you have any questions about the deletion process, please contact us:",
            },
            { kind: "contact" },
          ],
        },
      ],
    } satisfies LegalDoc,
  },
}

type RawMessages = typeof en

/**
 * Catalog maps are looked up dynamically (product/faq/review ids), so widen
 * them from their literal keys to string-keyed records. Everything else keeps
 * the exact literal shape from `en`, which forces every locale to translate
 * every key.
 */
export type Messages = Omit<RawMessages, "catalog"> & {
  catalog: {
    products: Record<string, ProductMessages>
    faqs: Record<string, FaqMessages>
    reviews: Record<string, ReviewMessages>
  }
}
