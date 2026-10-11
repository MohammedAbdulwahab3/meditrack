# MediTrack mobile (patients)

A Flutter app for patients and the public. It talks to the same Go API as the web app.

- **Scan:** check a pack by camera (QR) or by typing its code. No account needed.
- **Result:** shows whether the pack is genuine, expired, recalled, suspended, or not registered, plus product and batch details and the pack's supply-chain journey. If many different people have checked the same code, it warns that the label may be copied.
- **Find:** search a medicine across all pharmacies, compare price and stock, and reserve it for pickup (pay at the counter). Requires a patient account.
- **Orders:** see your reservations (waiting, ready for pickup, collected). Collected orders list each pack's code so you can verify it.
- **History:** checks are saved on the phone. When signed in, the app also shows the account's history from all devices.
- **Report:** report a suspicious medicine from the Scan screen or any result, with or without an account.
- **Account (optional):** sign in or create a patient account and see your reports and the team's replies. Business accounts are sent to the web dashboard.

## Run it

You need Flutter 3.35 or newer and the MediTrack API running (see `../README.md`).

```bash
flutter pub get

# Android emulator: 10.0.2.2 is the host machine, so the default works
flutter run

# Physical phone on the same Wi-Fi as your laptop: use the laptop's LAN IP
flutter run --dart-define=API_URL=http://192.168.1.20:8090

# Production
flutter build apk --release --dart-define=API_URL=https://meditrack.example.com
```

You can also change the server inside the app: **Account → Server**.

Debug builds allow plain `http://` so you can test against a dev laptop. Release builds require HTTPS.

## Code

```
lib/
  main.dart                 app, theme, bottom navigation
  api/api_client.dart       HTTP client (bearer-token auth via X-Client: mobile)
  api/models.dart           API response types
  api/code.dart             pack-code normalisation (matches the backend)
  state/app_state.dart      server URL, session (secure storage), on-device history
  screens/                  scan, scanner, result, history, report, account
  widgets/common.dart       shared widgets, status styling, logo
```

Run the tests with `flutter test`. They cover code normalisation, API parsing and errors, and a widget test.

## Next steps

- App Links / Universal Links so tapping a `https://…/v/CODE` link opens the app.
- Amharic translation.
- Proper launcher icon and splash screen (`flutter_launcher_icons`).
- Release signing and Play Store / App Store listings.
