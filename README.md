# acordismo

Offline chord and lyric reader built with Vite, React, SQLite (`sql.js` WASM), and Capacitor.

## 1. Database (`songs.db`)

Generate the default clean SQLite database (`public/songs.db`) from `smallhotelroom.github.io` Markdown songs:

```bash
./python/run-clean.sh
```

## 2. Local Web Development

```bash
nvm use
npm install
npm run dev
```

Build and preview the production web bundle locally:

```bash
npm run build
npm run preview
```

## 3. Android (via Docker)

Build the Docker compiler image (only needed once or when `Dockerfile` changes):

```bash
docker compose build
```

Compile the debug APK (`android/app/build/outputs/apk/debug/app-debug.apk`):

```bash
docker compose run --rm android-builder adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Debug / view live Android device logs:

```bash
docker compose run --rm android-builder adb logcat | grep -i capacitor
```

Open an interactive shell inside the Android builder container:

```bash
docker compose run --rm android-builder bash
```

## 4. iOS

Sync web assets and Capacitor plugins to the Xcode project (`ios/`):

```bash
npm run build
npx cap sync ios
```

Open in Xcode (requires macOS):

```bash
npx cap open ios
```
