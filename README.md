# acordismo

Offline chord and lyric reader built with Vite, React, SQLite (`sql.js` WASM), and Capacitor.

Depends on `smallhotelroom.github.io` (git clone it next to this repository).

## 1. Database (`songs-official.db`)

Generate the default official ("clean") SQLite database (`public/songs-official.db`) from `smallhotelroom.github.io` Markdown songs:

```bash
npm run db:build
```

## 2. PDF Generator

Build PDF from `public/songs.db`:

```bash
npm run pdf:build -- --output SmallHotelRoom.pdf 
```

More examples:

```bash
npm run pdf:build -- --db dist-dbs/songs-curated.db --playlist "Español" --template templates/espanol.tex --transpose -5 --capo-drop-correction --output Ukelele_Espanol.pdf
```

## 3. Local Web Development

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

## 4. Android (via Docker)

First, download or build the Docker image (only needed once or when `Dockerfile` changes)


**Option A: Pull the pre-built image (Fastest)**

The build environment is hosted privately on the GitHub Container Registry to save time.

1. Create a [GitHub Personal Access Token (Classic)](https://github.com/settings/tokens) and check the `read:packages` scope.
2. Log in to the registry (replace with your username and token):
   ```bash
   echo "YOUR_TOKEN" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
3. Later on (when you run the compiler), Docker will automatically pull the image.

**Option B: Build locally**

1. Build the Docker compiler image:
    ```bash
    docker compose build
    ```

### 4.1. Android (via Docker): Debug

Compile the debug APK (`android/app/build/outputs/apk/debug/app-debug.apk`):

```bash
docker compose up
```

Install the debug APK onto a USB-connected Android device:

```bash
docker compose run --rm android-builder adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

If fails, possibly you may locally (`sudo apt install android-tools-adb`):

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

More useful debug commands: debug/view live Android device logs:

```bash
docker compose run --rm android-builder adb logcat | grep -i capacitor
```

Even more useful debug commands: Open an interactive shell inside the Android builder container:

```bash
docker compose run --rm android-builder bash
```

### 4.2. Android (via Docker): Release APK

Or compile the release APK (`ls android/app/build/outputs/apk/release/acordismo-release-*.apk`):

```bash
GRADLE_TASK=assembleRelease docker compose up
```

### 4.3. Android (via Docker): Play Store bundle

Or compile the Play Store bundle (`ls android/app/build/outputs/bundle/release/app-release.aab`):

```bash
GRADLE_TASK=bundleRelease docker compose up
```

## 5. iOS

Sync web assets and Capacitor plugins to the Xcode project (`ios/`):

```bash
npm run build
npx cap sync ios
```

Open in Xcode (requires macOS):

```bash
npx cap open ios
```
