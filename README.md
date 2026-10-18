# Sphegatti

Over-the-air (OTA) update platform for **React Native Android**.

> **Android only.** iOS is not supported.

Push JavaScript bundle updates directly to your users — no Play Store review required.

---

## How it works

```
Your machine              Sphegatti server           User's Android device
─────────────────         ────────────────           ─────────────────────
npx ota publish  ───────→ releases registry    ←──── GET /updates/check
                     ↓
                 S3 bucket               ──────────→ downloads bundle
                 (yours or ours)                      app restarts with new JS
```

1. You run `npx ota publish` from your project or CI pipeline
2. Sphegatti registers the release and stores the bundle in S3
3. The app calls `/updates/check` at startup, downloads the new bundle, restarts with the new JS

---

## Storage options

| | Sphegatti S3 (managed) | Bring your own S3 |
|---|---|---|
| **Setup** | Nothing — works out of the box | Provide your bucket credentials |
| **Cost** | Included in your plan | You pay your AWS bill |
| **Control** | Managed by Sphegatti | Full control over your data |

---

## Setup

### 1. Install

```bash
npm install sphegatti
```

### 2. Wire the Android native module

Run from your React Native project root:

```bash
npx ota init
```

This automatically:
- Creates `OtaModule.kt` (downloads bundle, saves path, restarts app)
- Creates `OtaPackage.kt`
- Patches `MainApplication.kt` to register `OtaPackage` and load the OTA bundle on cold start

Then do a **one-time** native rebuild:

```bash
npx react-native run-android
```

You only need this rebuild once. Every OTA update after this is JS-only via `npx ota publish`.

<details>
<summary>No android/ folder? Expand for manual steps</summary>

Create these files in `android/app/src/main/java/com/<yourpackage>/`.

**`OtaModule.kt`**
```kotlin
package com.<yourpackage>

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.Process
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
                    // Persist path so MainApplication picks it up on next cold start
                    context.getSharedPreferences("sphegatti_ota", Context.MODE_PRIVATE)
                        .edit()
                        .putString("bundle_path", bundleFile.absolutePath)
                        .commit()
                    promise.resolve("Bundle downloaded; restarting")
                    Handler(Looper.getMainLooper()).postDelayed({
                        val launchIntent = context.packageManager
                            .getLaunchIntentForPackage(context.packageName)
                        if (launchIntent != null) {
                            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(launchIntent)
                        }
                        Process.killProcess(Process.myPid())
                    }, 300)
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

**Patch `MainApplication.kt`** — replace the `reactHost` property:
```kotlin
override val reactHost: ReactHost by lazy {
    val prefs = getSharedPreferences("sphegatti_ota", Context.MODE_PRIVATE)
    val savedPath = prefs.getString("bundle_path", null)
    val otaBundlePath = if (savedPath != null && File(savedPath).exists()) savedPath else null
    getDefaultReactHost(
        context = applicationContext,
        packageList = PackageList(this).packages.apply {
            add(OtaPackage())
        },
        jsBundleFilePath = otaBundlePath,
    )
}
```

Add these imports at the top of `MainApplication.kt`:
```kotlin
import android.content.Context
import java.io.File
```

</details>

### 3. Add the client SDK

```tsx
import { checkForUpdate } from 'sphegatti/client';

// Call this once at app startup, e.g. in a useEffect in your root component
useEffect(() => {
  checkForUpdate({ appId: 'your-app-id' });
}, []);
```

`checkForUpdate` handles everything: fetching the update, downloading the bundle, and restarting the app. On the next launch the new JS is live.

### 4. Create `ota.config.js`

`npx ota init` creates this for you, but here's what it looks like:

```js
// ota.config.js
module.exports = {
  appId: 'your-app-id',
  runtimeVersion: '1',

  publish: {
    serverUrl: 'https://sphegatti.onrender.com',
    apiKey: process.env.SPHEGATTI_API_KEY || '',
  },
};
```

Store your API key in an environment variable — never commit it.

### 5. Publish a release

```bash
export SPHEGATTI_API_KEY=your-key
npx ota publish
```

That's it. The update is live and users will get it on their next app open.

---

## CLI reference

### `npx ota init`

Sets up the native Android integration and creates `ota.config.js`.

```bash
npx ota init
```

Run once from your React Native project root. Does nothing if files already exist.

### `npx ota publish`

Builds the JS bundle and uploads it as a new release.

```bash
npx ota publish [options]
```

| Flag | Default | Description |
|---|---|---|
| `--platform` | `android` | Target platform |
| `--channel` | `production` | Release channel |
| `--entry-file` | `index.js` | React Native entry file |
| `--runtime-version` | from config | Override runtime version |

Reads `appId`, `serverUrl`, and `apiKey` from `ota.config.js` automatically.

**CI example (GitHub Actions):**
```yaml
- name: Publish OTA update
  env:
    SPHEGATTI_API_KEY: ${{ secrets.SPHEGATTI_API_KEY }}
  run: npx ota publish --channel production
```

---

## Server API

All requests go to `https://sphegatti.onrender.com`.

### `GET /health`

```json
{ "status": "ok" }
```

### `GET /updates/check`

Check whether a newer release exists for the given app and device config.

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

---

## `runtimeVersion` — when to increment

Increment whenever you ship a new APK — a new React Native version, a new native module, or any native code change. Clients on a different runtime version will not receive OTA updates, preventing crashes from incompatible bundles.

```
runtimeVersion: '1'  →  APK shipped to Play Store (v1)
runtimeVersion: '2'  →  New APK shipped (v2) — bump before publishing OTA updates for v2
```

---

## Bring your own S3

To store bundles in your own AWS S3 bucket, go to the Sphegatti dashboard → Storage → Bring your own S3, and provide:

- Bucket name
- Region
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- *(optional)* CloudFront domain for edge delivery

No code change required. Sphegatti will use your bucket for all new releases.

---

## License

None. It's not open source. You can use it for free, but you cannot redistribute or modify it.
