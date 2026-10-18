# Sphegatti

Over-the-air (OTA) update platform for **React Native Android**.

> **Android only.** iOS is not supported.

Push JavaScript bundle updates directly to your users — no Play Store review required.

---

## How it works

```
Your machine                 Sphegatti server           User's Android device
─────────────────            ────────────────           ─────────────────────
npx sphegatti publish  ────→ releases registry    ←──── GET /updates/check
                        ↓
                    S3 bucket               ──────────→ GET /bundles/:id
                    (yours or ours)                      OtaModule saves bundle
                                                         App reloads new bundle
```

1. You run `npx sphegatti publish` from your project or CI pipeline
2. Sphegatti's server registers the release and stores the bundle in S3
3. The app calls `/updates/check` at startup, downloads the new bundle, and reloads

---

## Storage options

| | Sphegatti S3 (managed) | Bring your own S3 |
|---|---|---|
| **Setup** | Nothing — works out of the box | Provide your bucket credentials |
| **Cost** | Included in your plan | You pay your AWS bill |
| **Control** | Managed by Sphegatti | Full control over your data |

You choose storage when you register your app. No code change required.

---

## Setup

### 1. Install

```bash
npm install --save-dev sphegatti
```

### 2. Wire up the Android native module

Run `npx ota init` from your React Native project root:

```bash
npx ota init
```

If an `android/` folder is detected, `init` does everything for you:

- Creates `OtaModule.kt` with the correct package name
- Creates `OtaPackage.kt` with the correct package name
- Registers `OtaPackage` in `MainApplication.kt`

Then do a full native rebuild:

```bash
npm run android
```

<details>
<summary>No android/ folder? Expand for manual steps</summary>

Create two files in `android/app/src/main/java/com/<yourpackage>/`.

**`OtaModule.kt`**
```kotlin
package com.<yourpackage>

import com.facebook.react.ReactApplication
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

@ReactModule(name = "OtaModule")
class OtaModule(
    private val context: ReactApplicationContext
) : ReactContextBaseJavaModule(context) {

    override fun getName() = "OtaModule"

    @ReactMethod
    fun downloadAndActivate(bundleUrl: String, promise: Promise) {
        Thread {
            try {
                val connection = URL(bundleUrl).openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 30000
                try {
                    connection.connect()
                    if (connection.responseCode !in 200..299) {
                        throw Exception("Download failed: HTTP ${connection.responseCode}")
                    }
                    val otaDir = File(context.filesDir, "ota")
                    if (!otaDir.exists() && !otaDir.mkdirs()) {
                        throw Exception("Could not create OTA directory")
                    }
                    val tempFile = File(otaDir, "update.tmp")
                    val bundleFile = File(otaDir, "index.android.bundle")
                    connection.inputStream.use { input ->
                        tempFile.outputStream().use { output -> input.copyTo(output) }
                    }
                    if (tempFile.length() == 0L) {
                        tempFile.delete()
                        throw Exception("Downloaded bundle is empty")
                    }
                    if (bundleFile.exists() && !bundleFile.delete()) {
                        tempFile.delete()
                        throw Exception("Could not replace bundle")
                    }
                    if (!tempFile.renameTo(bundleFile)) {
                        tempFile.delete()
                        throw Exception("Could not save bundle")
                    }
                    val host = context.applicationContext as ReactApplication
                    val reactHost = host.reactHost
                        ?: throw Exception("ReactHost is not available")
                    reactHost.setBundleSource(bundleFile.absolutePath)
                    promise.resolve("Bundle downloaded; activation requested")
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                promise.reject("OTA_UPDATE_FAILED", e)
            }
        }.start()
    }
}
```

**`OtaPackage.kt`**
```kotlin
package com.<yourpackage>

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OtaPackage : ReactPackage {
    override fun createNativeModules(
        context: ReactApplicationContext
    ): List<NativeModule> = listOf(OtaModule(context))

    override fun createViewManagers(
        context: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
```

**Register in `MainApplication.kt`**
```kotlin
override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
        context = applicationContext,
        packageList = PackageList(this).packages.apply {
            add(OtaPackage())   // ← add this line
        },
    )
}
```

</details>

### 3. Publish a release

```bash
npx sphegatti publish \
  --app-id <your-app-id> \
  --api-key <your-api-key> \
  --platform android \
  --channel production
```

Get your `app-id` and `api-key` from the Sphegatti dashboard.

Run this from your project root or add it to your CI pipeline.

### 4. Check for updates in your app

```tsx
import { NativeModules, DevSettings } from 'react-native';

const { OtaModule } = NativeModules;

const SPHEGATTI_URL = 'https://api.sphegatti.com';
const APP_ID        = 'your-app-id';
const RUNTIME_VER   = '1';   // increment when you ship a new APK

async function checkForUpdate(currentUpdateId: string) {
  const url = new URL('/updates/check', SPHEGATTI_URL);
  url.searchParams.set('appId', APP_ID);
  url.searchParams.set('platform', 'android');
  url.searchParams.set('runtimeVersion', RUNTIME_VER);
  url.searchParams.set('channel', 'production');
  url.searchParams.set('currentUpdateId', currentUpdateId);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.updateAvailable) {
    await OtaModule.downloadAndActivate(data.bundleUrl);
    DevSettings.reload();   // reloads the JS engine with the new bundle
  }
}
```

Call `checkForUpdate` at app startup, passing the release ID your current build shipped with.

---

## CLI reference

### `sphegatti publish`

Builds your JS bundle and registers it as a new release on the Sphegatti server.

```bash
npx sphegatti publish [options]
```

| Flag | Default | Description |
|---|---|---|
| `--app-id` | — | **Required.** Your app ID from the dashboard |
| `--api-key` | — | **Required.** Your API key from the dashboard |
| `--platform` | `android` | Target platform |
| `--channel` | `production` | Release channel (`production`, `staging`, etc.) |
| `--entry-file` | `index.js` | React Native entry file |
| `--runtime-version` | — | Override the runtime version for this release |

**CI example (GitHub Actions):**
```yaml
- name: Publish OTA update
  run: |
    npx sphegatti publish \
      --app-id ${{ secrets.SPHEGATTI_APP_ID }} \
      --api-key ${{ secrets.SPHEGATTI_API_KEY }} \
      --platform android \
      --channel production
```

---

## Server API

All requests go to `https://api.sphegatti.com`.

### `GET /health`

```json
{ "status": "ok" }
```

### `GET /updates/check`

Check whether a newer release exists for the given app + device configuration.

**Query parameters**

| Param | Required | Description |
|---|---|---|
| `appId` | yes | Your app identifier |
| `platform` | yes | `android` |
| `runtimeVersion` | yes | Must match the release's runtime version |
| `channel` | yes | `production`, `staging`, etc. |
| `currentUpdateId` | yes | Release ID the app is currently running |

**Response — update available**
```json
{
  "updateAvailable": true,
  "updateId": "release-1749123456789",
  "bundleUrl": "https://...",
  "sha256": "c5abcd8c..."
}
```

**Response — already up to date**
```json
{ "updateAvailable": false }
```

**Response — no releases found**
```json
{ "updateAvailable": false, "reason": "no_releases" }
```

---

## `runtimeVersion` — when to increment

Increment `runtimeVersion` every time you ship a new APK — a new React Native version, a new native module, or any native change. Clients on a different runtime version will not receive OTA updates, preventing crashes from incompatible bundles.

```
runtimeVersion: '1'  →  APK shipped to Play Store (v1)
runtimeVersion: '2'  →  New APK shipped (v2) — bump before publishing new updates
```

---

## Bring your own S3

To store bundles in your own AWS S3 bucket, go to the Sphegatti dashboard → Storage → Bring your own S3, and provide:

- Bucket name
- Region
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- *(optional)* CloudFront domain for edge delivery

No code change is required. Sphegatti will use your bucket for all new releases.

---

## License

None. It's not open source. You can use it for free, but you cannot redistribute or modify it.