import { BUSINESS } from "../config/business"
import type { FAQ } from "./types"

export const faqs: FAQ[] = [
  {
    id: "faq-001",
    question: "How do I place an order?",
    answer:
      "The current website uses a preview code so you can test the planned flow without sending a WhatsApp message. After Meta approval, the code will be delivered to the WhatsApp number you enter. First-time customers provide only their name and delivery location — no secondary number, email or password.",
  },
  {
    id: "faq-002",
    question: "How do you take payment?",
    answer:
      "Cash on delivery only. We do not accept online payments — there is no card, UPI or wallet checkout on this site, and we never collect your payment details. Simply pay our delivery person in cash when your order arrives.",
  },
  {
    id: "faq-003",
    question: "When will my order arrive? (Daily cutoff)",
    answer:
      "Everything is made fresh in small batches. Order by 11:59 PM for delivery the next morning. At 12:00 AM a new daily batch begins, so an order placed then is scheduled for the following morning. All dates are calculated in India Standard Time.",
  },
  {
    id: "faq-004",
    question: "Where do you deliver?",
    answer:
      "Right now we deliver only in the Bachupally area of Hyderabad and nearby streets. We're a small, fresh-prep kitchen and we'll expand to more localities as we grow — orders outside the active delivery area may be declined.",
  },
  {
    id: "faq-005",
    question: "Do you offer discounts or coupon codes?",
    answer:
      "No percentage discounts or coupons. Instead, your first order includes a free surprise goodie (for example, a complimentary ragi malt with a sprout bowl), and when you refer a friend you both receive a goodie. Goodies are added while we prepare your order, so they appear in your order summary once it's confirmed — not at checkout.",
  },
  {
    id: "faq-006",
    question: "Can I cancel an order? What about refunds?",
    answer:
      "You can request cancellation before 11:59 PM IST on the date you order, provided preparation has not started. After the batch closes, cancellation may not be possible. Delivered food can't be returned for safety reasons, but if anything is missing or incorrect, contact us on the delivery day. Since we take no payment online, there are no online refunds to process.",
  },
  {
    id: "faq-007",
    question: "How should I store my order?",
    answer:
      "Ragi drinks are best enjoyed warm and fresh. Sprouts and salads should be refrigerated and eaten within a day of delivery. Fresh juices should be kept chilled and finished the same day for the best taste and nutrition.",
  },
  {
    id: "faq-008",
    question: "Are your products suitable for diabetics?",
    answer:
      "Many of our items use low-GI ingredients like ragi, millets and sprouted lentils, and our juices contain no added sugar. Everyone's needs differ, though, so please check with your doctor before changing a medical diet.",
  },
  {
    id: "faq-009",
    question: "How do I track my order or reach your team?",
    answer: `Order tracking will be available in your account. WhatsApp login verification will be enabled after our Meta integration is approved; order notifications may be added later with your consent. For help, call ${BUSINESS.phoneDisplay} between 9 AM and 6 PM IST.`,
  },
]
