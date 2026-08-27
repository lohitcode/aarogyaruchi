# Aarogya Ruchi Mobile App

React Native mobile app built with Expo for the Aarogya Ruchi healthy food delivery platform.

## Tech Stack

- **Expo SDK** - Latest
- **Expo Router** - File-based routing
- **Zustand** - State management
- **NativeWind** - Tailwind CSS for React Native
- **React Native Reanimated** - Animations

## Getting Started

### Prerequisites

- Node.js 18+ and bun
- iOS Simulator (Mac only) or Android Emulator
- Expo Go app on your physical device (optional)

### Installation

```bash
cd clients/apps/mobile
bun install
```

### Running the App

```bash
bun start
# or
npx expo start
```

Then:
- **iOS**: Press `i` to open iOS Simulator
- **Android**: Press `a` to open Android Emulator
- **Physical Device**: Scan the QR code with Expo Go app (Camera app)

## Project Structure

```
src/
├── app/              # Expo Router pages (login, runs, run, cash, scan…)
├── components/       # Reusable components
├── lib/              # API client, config, GPS tracking (lib/tracking.ts)
├── theme/            # Design system
├── hooks/            # Custom hooks
├── constants/        # App constants
└── utils/           # Utility functions
```

## Features

- ✅ Browse products by category
- ✅ Search products
- ✅ View product details
- ✅ Add to cart with quantity controls
- ✅ Checkout flow
- ✅ Order history
- ✅ User profile
- ✅ Smooth animations

## Design System

The app uses the same design system as the web app:

### Colors
- **Primary**: #429D49 (Health green)
- **Background**: #FFFFFF
- **Card**: #F6EDE4 (Warm beige)
- **Foreground**: #211509 (Dark brown)

### Typography
- **Display**: Bricolage Grotesque
- **Body**: Inter
- **Accent**: Londrina Solid

## Fonts

Download required fonts and place in `assets/fonts/`:
- Bricolage Grotesque (Bold, SemiBold, Regular)
- Inter (Bold, SemiBold, Medium, Regular)
- Londrina Solid (Regular)

See `assets/fonts/README.md` for download links.

## Building for Production

### iOS
```bash
bun install -g eas-cli
eas build --platform ios
```

### Android
```bash
eas build --platform android
```

## Development Notes

- Talks to the Go API (dev builds → localhost:10.0.2.2, release →
  api.aarogyaruchi.com; override with EXPO_PUBLIC_API_URL)
- Auth is OTP + access/refresh tokens; GPS streams over WebSocket with an
  offline-buffered HTTP batch fallback (lib/tracking.ts)

## Future Enhancements

- [ ] Persist cart with AsyncStorage
- [ ] Backend API integration
- [ ] Push notifications
- [ ] Payment gateway integration
- [ ] Real-time order tracking
- [ ] User authentication
- [ ] Reviews and ratings
