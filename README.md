# AarogyaRuchi

Home-made health food delivery platform based in Hyderabad, India.

## What We Sell

- **Ragi Jawa** - Traditional millet porridge
- **Ragi Malt** - Nutritious millet drink
- **Sprouts** - Fresh, healthy sprouts
- **Fruit Juices** - Fresh, no preservatives

---

## Business Flow

### For Customers

```
Register (phone OTP)
       │
       ▼
 Browse Products
       │
       ▼
 Order before 12 AM ──────────────────┐
       │                              │
       ▼                              ▼
 ┌─────────────┐              ┌─────────────┐
 │ Home Delivery│              │ Gym Pickup  │
 │ (if in radius)│              │ (from partner)│
 └──────┬──────┘              └──────┬──────┘
        │                             │
        ▼                             ▼
 Next day delivery            Next day at gym
 to your address              Show OTP → Get box
```

### For Gyms

```
Gym registers (phone)
       │
       ▼
 Admin reviews & approves
       │
       ▼
 Gym gets dashboard access
       │
       ▼
 Members order → Delivered to gym → Gym earns commission
```

### For Admins

```
Super Admin (owner)
       │
       ├── Locality Admin (Gachibowli)
       │         ├── Manages orders in area
       │         └── Delivery Partners 1, 2
       │
       ├── Locality Admin (Madhapur)
       │         ├── Manages orders in area
       │         └── Delivery Partner 3
       │
       └── ...more localities
```

---

## Infrastructure

```
┌─────────────────────────────────────┐
│  Hetzner VPS ((redacted))        │
│  ┌─────────────┐  ┌─────────────┐   │
│  │   Go API    │  │   Valkey    │   │
│  │  REST + WS  │◄─┤   (Cache)   │   │
│  └──────┬──────┘  └─────────────┘   │
└─────────┼───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Supabase/Neon (External)           │
│  PostgreSQL                         │
└─────────────────────────────────────┘
```

| Component | Tech |
|-----------|------|
| Backend | Go (chi router, sqlc) |
| Database | PostgreSQL |
| Cache/OTP | Valkey (Redis fork) |
| Auth | WhatsApp OTP (MSG91) |
| Hosting | Hetzner VPS (€3.49/month) |

---

## Schema

| Table | Purpose |
|-------|---------|
| `localities` | Service areas |
| `admins` | Super + locality admins |
| `delivery_partners` | Delivery personnel |
| `users` | Customers |
| `gyms` | Partner gyms |
| `products` | Food catalog |
| `orders` | All orders |
| `order_items` | Products in order |

---

## Apps (Planned)

| App | Users | Features |
|-----|-------|----------|
| Customer App | Customers | Browse, order, track |
| Gym Dashboard | Gym owners | View deliveries, commission |
| Admin Panel | Admins | Manage gyms, products, orders |
| Delivery App | Delivery partners | View & deliver orders |
