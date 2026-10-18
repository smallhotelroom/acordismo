# acordismo

## Local

```bash
npm run dev
```

## Android

```bash
docker compose up --build
docker compose run --rm android-builder adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
