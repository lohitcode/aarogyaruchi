export type ProductCategory = "meals" | "snacks" | "drinks"

export type ProductSize = {
  label: string
  weight: string
  price: number
}

export type NutritionInfo = {
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
}

export type Product = {
  id: string
  slug: string
  name: string
  description: string
  category: ProductCategory
  image: string
  sizes: ProductSize[]
  ingredients: string[]
  nutrition: NutritionInfo
  tags: string[]
  featured: boolean
}

export type Review = {
  id: string
  name: string
  avatar: string
  rating: number
  text: string
  product: string
}

export type FAQ = {
  id: string
  question: string
  answer: string
}
