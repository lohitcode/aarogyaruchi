import type { Product } from "./types"

// CDN base URL for product images (Cloudflare R2 + Workers)
const CDN_BASE = "https://images-cdn.lohit.workers.dev"

/**
 * Aarogya Ruchi Product Data
 * Real products sold in parks and gyms
 */
export const products: Product[] = [
  // Millet / Traditional Health Drinks
  {
    id: "ragi-jawa",
    slug: "ragi-jawa",
    name: "Ragi Jawa",
    description:
      "Freshly prepared ragi drink, usually served warm. Traditional Karnataka health drink rich in calcium and iron.",
    category: "drinks",
    image: `${CDN_BASE}/ragi-jawa.png`,
    sizes: [
      { label: "Small", weight: "200ml", price: 40 },
      { label: "Medium", weight: "300ml", price: 60 },
      { label: "Large", weight: "400ml", price: 80 },
    ],
    ingredients: ["Finger millet", "Water", "Jaggery", "Cardamom"],
    nutrition: {
      calories: "120",
      protein: "3g",
      carbs: "24g",
      fat: "1g",
      fiber: "2g",
    },
    tags: ["Calcium-Rich", "Traditional", "Warm Drink"],
    featured: true,
  },
  {
    id: "ragi-malt-sweet",
    slug: "ragi-malt-sweet",
    name: "Ragi Malt (Sweet)",
    description:
      "Classic sweet ragi malt drink made from sprouted finger millet. High calcium health drink.",
    category: "drinks",
    image: `${CDN_BASE}/ragi-malt-sweet.png`,
    sizes: [
      { label: "Small", weight: "200ml", price: 50 },
      { label: "Medium", weight: "300ml", price: 70 },
      { label: "Large", weight: "400ml", price: 90 },
    ],
    ingredients: ["Sprouted ragi", "Jaggery", "Milk", "Cardamom"],
    nutrition: {
      calories: "140",
      protein: "4g",
      carbs: "26g",
      fat: "2g",
      fiber: "3g",
    },
    tags: ["Calcium-Rich", "Sprouted", "Sweet"],
    featured: true,
  },
  {
    id: "ragi-malt-salted",
    slug: "ragi-malt-salted",
    name: "Ragi Malt (Salted)",
    description:
      "Savory version of the traditional ragi malt. Perfect for those who prefer less sweet.",
    category: "drinks",
    image: `${CDN_BASE}/ragi-malt-salted.png`,
    sizes: [
      { label: "Small", weight: "200ml", price: 50 },
      { label: "Medium", weight: "300ml", price: 70 },
      { label: "Large", weight: "400ml", price: 90 },
    ],
    ingredients: ["Sprouted ragi", "Salt", "Buttermilk", "Cumin"],
    nutrition: {
      calories: "130",
      protein: "4g",
      carbs: "25g",
      fat: "2g",
      fiber: "3g",
    },
    tags: ["Calcium-Rich", "Sprouted", "Savory"],
    featured: false,
  },

  // Sprouts
  {
    id: "mixed-sprouts",
    slug: "mixed-sprouts",
    name: "Mixed Sprouts",
    description:
      "Healthy combination of sprouted green gram, chickpeas, and other lentils. Protein-rich snack.",
    category: "snacks",
    image: `${CDN_BASE}/sprouts.png`,
    sizes: [
      { label: "Regular", weight: "150g", price: 50 },
      { label: "Large", weight: "250g", price: 80 },
    ],
    ingredients: [
      "Green gram sprouts",
      "Chickpea sprouts",
      "Moath sprouts",
      "Onion",
      "Lemon",
      "Spices",
    ],
    nutrition: {
      calories: "180",
      protein: "12g",
      carbs: "30g",
      fat: "2g",
      fiber: "8g",
    },
    tags: ["High-Protein", "Fresh", "Sprouted"],
    featured: true,
  },
  {
    id: "green-gram-sprouts",
    slug: "green-gram-sprouts",
    name: "Green Gram Sprouts",
    description:
      "Pesalu sprouts - protein-rich green gram sprouts. Traditional Andhra healthy snack.",
    category: "snacks",
    image: `${CDN_BASE}/sprouts.png`,
    sizes: [
      { label: "Regular", weight: "150g", price: 50 },
      { label: "Large", weight: "250g", price: 80 },
    ],
    ingredients: ["Green gram sprouts", "Coconut", "Mustard seeds", "Lemon"],
    nutrition: {
      calories: "170",
      protein: "13g",
      carbs: "28g",
      fat: "2g",
      fiber: "9g",
    },
    tags: ["High-Protein", "Pesalu", "Traditional"],
    featured: true,
  },

  // Fresh Fruit Juices
  {
    id: "orange-juice",
    slug: "orange-juice",
    name: "Orange Juice",
    description:
      "Fresh seasonal orange juice. No added sugar or preservatives. Pure vitamin C boost.",
    category: "drinks",
    image: `${CDN_BASE}/orange-juice.png`,
    sizes: [
      { label: "Small", weight: "200ml", price: 60 },
      { label: "Medium", weight: "300ml", price: 80 },
      { label: "Large", weight: "400ml", price: 100 },
    ],
    ingredients: ["Fresh oranges", "Amla", "Optional: Chia seeds"],
    nutrition: {
      calories: "110",
      protein: "2g",
      carbs: "26g",
      fat: "0g",
      fiber: "1g",
    },
    tags: ["Fresh", "Seasonal", "Vitamin C"],
    featured: false,
  },
  {
    id: "watermelon-juice",
    slug: "watermelon-juice",
    name: "Watermelon Juice",
    description:
      "Refreshing watermelon juice. Perfect summer drink with natural sweetness.",
    category: "drinks",
    image: `${CDN_BASE}/watermelon-juice.png`,
    sizes: [
      { label: "Small", weight: "200ml", price: 50 },
      { label: "Medium", weight: "300ml", price: 70 },
      { label: "Large", weight: "400ml", price: 90 },
    ],
    ingredients: ["Fresh watermelon", "Mint leaves", "Black salt"],
    nutrition: {
      calories: "80",
      protein: "1g",
      carbs: "20g",
      fat: "0g",
      fiber: "1g",
    },
    tags: ["Refreshing", "Seasonal", "Hydrating"],
    featured: false,
  },
  {
    id: "mosambi-juice",
    slug: "mosambi-juice",
    name: "Mosambi Juice",
    description:
      "Sweet lime juice with a hint of salt. Hydrating and refreshing citrus drink.",
    category: "drinks",
    image: `${CDN_BASE}/mosambi-juice.png`,
    sizes: [
      { label: "Small", weight: "200ml", price: 50 },
      { label: "Medium", weight: "300ml", price: 70 },
      { label: "Large", weight: "400ml", price: 90 },
    ],
    ingredients: ["Fresh mosambi", "Black salt", "Chat masala"],
    nutrition: {
      calories: "90",
      protein: "1g",
      carbs: "22g",
      fat: "0g",
      fiber: "1g",
    },
    tags: ["Refreshing", "Vitamin C", "Seasonal"],
    featured: false,
  },

  // Healthy Snacks (Sprout-based)
  {
    id: "sprout-salad",
    slug: "sprout-salad",
    name: "Sprout Salad",
    description:
      "Fresh sprout mix with onions, tomatoes, cucumber, lemon, and spices. Healthy chaat-style salad.",
    category: "snacks",
    image: `${CDN_BASE}/sprouts.png`,
    sizes: [
      { label: "Regular", weight: "200g", price: 60 },
      { label: "Large", weight: "350g", price: 100 },
    ],
    ingredients: [
      "Mixed sprouts",
      "Onion",
      "Tomato",
      "Cucumber",
      "Lemon juice",
      "Green chutney",
    ],
    nutrition: {
      calories: "150",
      protein: "8g",
      carbs: "22g",
      fat: "3g",
      fiber: "10g",
    },
    tags: ["Fresh", "Chaat-Style", "High-Fiber"],
    featured: true,
  },
]
