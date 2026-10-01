# react-native-carrot-quest

Unofficial React Native bindings for the [Carrot quest](https://www.carrotquest.io/) mobile SDKs, built with [Nitro Modules](https://nitro.margelo.com/).

> **Not affiliated with Carrot quest.** Carrot does not officially support React
> Native, so this package maintains its own compatibility coverage against the
> vendor's iOS and Android SDKs. Versions are pinned deliberately — see
> [SDK versions](#sdk-versions).

- Swift and Kotlin implementations, no Objective-C bridging layer
- Fully typed across the JS/native boundary — the spec is the single source of truth
- `setup()` resolves only when the SDK reports success, so auth can never race init
- Native init hooks so the SDK is ready before your JS bundle loads
- A `verify:native` check that fails if a pinned SDK stops exposing a call the bridge makes

## Requirements

| | Minimum |
|---|---|
| React Native | 0.75 (New Architecture) |
| iOS | 13.4 |
| Android | API 24 |

## Installation

```bash
npm install react-native-carrot-quest react-native-nitro-modules
```

`react-native-nitro-modules` is a required peer dependency.

### iOS

```bash
cd ios && pod install
```

### Android

The Carrot Android SDK and two of its transitive dependencies live outside Maven
Central. Add both repositories to your `android/build.gradle`:

```gradle
allprojects {
  repositories {
    maven { url "https://raw.github.com/carrotquest/android-sdk/carrotquest" }
    // SDK 3.x pulls com.github.Redman1037:TSnackBar and com.github.chrisbanes:PhotoView
    maven { url "https://jitpack.io" }
  }
}
```

## Usage

### Pick an API style

The default export exposes every method on one `CarrotQuest` object:

```ts
import CarrotQuest from 'react-native-carrot-quest';

CarrotQuest.setup('your-api-key', {
  locale: 'ru',
  theme: 'fromDevice',
}).catch((error) => {
  console.warn('Carrot Quest setup failed', error);
});

CarrotQuest.trackEvent('app_opened');
```

Named exports remain available and call the same functions:

```ts
import { setup, trackEvent } from 'react-native-carrot-quest';
```

Carrot Quest is a process-wide native singleton, so a React Context provider is
not required for setup, auth, tracking, or opening chat. Add a provider (or your
existing state store) only when React components need shared **reactive** state,
such as an unread badge or chat-visibility state.

Call `setup()` once. The package owns readiness natively: if another method is
called while setup is still finishing, it waits for that same setup attempt.
Your application does not need a provider, a readiness promise, or repeated
`setup()` calls.

### Option A: initialise from `index.js`

Use this when Carrot Quest should start as soon as the JS bundle evaluates:

```js
import { AppRegistry } from 'react-native';
import CarrotQuest from 'react-native-carrot-quest';
import App from './App';
import { name as appName } from './app.json';

// Start setup early, but do not await it before registering the React app.
CarrotQuest.setup('your-api-key', {
  locale: 'ru',
  theme: 'fromDevice',
}).catch((error) => {
  console.warn('Carrot Quest setup failed', error);
});

AppRegistry.registerComponent(appName, () => App);
```

### Option B: initialise from `App.tsx`

Use this when the first screen does not need Carrot Quest and you prefer to let
React commit its first render before setup begins:

```tsx
import { useEffect } from 'react';
import CarrotQuest from 'react-native-carrot-quest';

export default function App() {
  useEffect(() => {
    CarrotQuest.setup('your-api-key', {
      locale: 'ru',
      theme: 'fromDevice',
    }).catch((error) => {
      console.warn('Carrot Quest setup failed', error);
    });
  }, []);

  return <Navigation />;
}
```

After this one call, use `CarrotQuest.auth()`, `openChat()`, `trackEvent()` and
the rest of the API directly wherever they are needed. Do not hide the whole
app behind the setup promise unless support chat is required for the first
screen.

### Does setup affect startup time?

Potentially, yes—but the API style (default object, named imports, or provider)
is not what matters. The important choices are **when setup starts** and whether
your app waits for it before rendering:

| Placement | SDK starts | Startup tradeoff |
|---|---|---|
| `index.js` | During JS bundle evaluation | Ready earlier; native CPU, disk, and network work may compete with startup. Registering the app without awaiting setup keeps it off the explicit render gate. |
| `App.tsx` `useEffect` | After the first React commit | Usually the lowest-risk choice for first-render latency; chat becomes ready slightly later. |

Importing the package only creates the Nitro hybrid-object binding. The
meaningful work begins when `setup()` initializes the vendor SDK. Because the
method returns a promise, calling it does not require blocking React, but gating
your root component on that promise will extend time-to-content by the setup
duration.

Measure the impact in a **release build** over multiple cold launches. Compare a
user-visible milestone such as navigation-ready or first content with and
without early setup; timing only the setup promise measures SDK readiness, not
its effect on the rest of startup.

### Setup guarantees

`setup()` returns a promise so the application can observe success or failure—an
invalid key or a dead network does not leave a silently half-initialised SDK.
You do not need to await that promise before calling another package method;
the native readiness queue preserves the call order.

Matching concurrent calls are single-flight. Mutable options contributed by a
call that joins during initialization are applied before every joined promise
resolves, including a call arriving while success is being finalized.

SDK operations called during initialization wait in the native setup queue.
Promise-returning operations reject with the setup error if initialization
fails; fire-and-forget operations are skipped and logged.

Calling `setup()` again with a **different** API key, locale, EU-server flag,
App Group or service mode rejects with a configuration-conflict error rather
than resolving and quietly keeping the first configuration:

```ts
await setup(productionKey);
await setup(stagingKey); // rejects — production is still active
```

The native SDKs cannot be re-pointed at another account at runtime. Restart the
process to change it.

### Authenticating

Carrot has **two distinct authentication flows** with different security
properties. They are not interchangeable.

```ts
import { auth, hashedAuth, logout } from 'react-native-carrot-quest';

// Recommended. `hash` is generated per user on your server.
const carrotId = await hashedAuth(userId, hashFromYourBackend);

// Simpler, less secure. `userAuthKey` is the single key from your Carrot
// settings, shipped inside the app and identical for every user.
const sameId = await auth(userId, USER_AUTH_KEY);

await logout();
```

| | `hashedAuth(userId, hash)` | `auth(userId, userAuthKey)` |
|---|---|---|
| Credential | Per-user hash | One shared key |
| Lives | On your server | In the app binary |
| Use when | You have a backend | You have no backend |
| Security | **Recommended** | Anyone who extracts the key can authenticate as any user id |

> Do not pass a per-user backend hash to `auth()` — it takes the static User
> Auth Key, and authentication will fail.

### Chat, properties, and tracking

```ts
import {
  closeChat,
  getUnreadConversationsCount,
  onChatVisibilityChanged,
  openChat,
  setProperties,
  setUserProperties,
  trackEvent,
  trackScreen,
  trackUtm,
} from 'react-native-carrot-quest';

await openChat();
await closeChat(); // iOS only

// Listeners return a subscription — remove it on unmount.
const subscription = onChatVisibilityChanged((visible) => setOpen(visible));
subscription.remove();

const unread = await getUnreadConversationsCount();

setUserProperties({ name: 'Ada', email: 'ada@example.com', custom: { plan: 'pro' } });

// Merge operations and the e-commerce namespace:
setProperties([
  { key: 'cartAmount', value: '42', kind: 'ecommerce' },
  { key: 'visits', value: '1', operation: 'add' },
]);

trackEvent('checkout_completed', { total: 42, currency: 'EUR', firstOrder: true });
trackScreen('CheckoutScreen');
trackUtm('https://example.com/?utm_source=newsletter');
```

### Push notifications

Register the device token, then hand Carrot payloads to the SDK:

```ts
import {
  handlePushClick,
  handlePushNotification,
  isCarrotPush,
  setPushToken,
} from 'react-native-carrot-quest';

setPushToken(token); // APNs hex string on iOS, FCM token on Android

// In your message handler:
if (isCarrotPush(remoteMessage.data)) {
  handlePushNotification(remoteMessage.data);
}

// iOS, when the user taps a notification:
handlePushClick(response.notification.request.content.userInfo, /* openLink */ false);
```

Payload arguments accept either a decoded object or a raw JSON string.

**iOS also needs, outside this package:**

1. A Notification Service Extension target using `CarrotNotificationServiceExtension`.
2. An App Group shared between the app and that extension, passed as
   `setup(key, { appGroup: 'group.com.example' })`. Without it,
   `wasPushShownEarlier` cannot work and rich pushes will not render.

**Android also needs** a `POST_NOTIFICATIONS` permission request on API 33+, and
optionally `notificationIconResourceName` in the setup options.

### Deep links

```ts
import { onUrlOpen } from 'react-native-carrot-quest';

// iOS only — intercept links instead of letting the SDK open them.
useEffect(() => {
  const subscription = onUrlOpen('all', (url) =>
    navigation.navigate(routeFor(url))
  );

  return () => subscription.remove();
}, [navigation]);
```

On Android, links route through the activity named by
`parentActivityClassName`; the SDK exposes no interception hook.

> **Keep at least one `onUrlOpen` listener registered while you want links
> intercepted.** The SDK's url opener is a setter with no detach, so removing
> every listener leaves it installed with nobody to receive the url — links
> then go nowhere rather than reverting to the SDK's own handling. Removing
> subscriptions on unmount is still right; just re-register on mount.

## API

| Method | Returns | iOS | Android |
|---|---|:---:|:---:|
| `setup(apiKey, options?)` | `Promise<void>` | ✅ | ✅ |
| `isConfigured()` | `boolean` | ✅ | ✅ |
| `getSdkVersion()` | `string` | ✅ | ✅ |
| `auth(userId, userAuthKey)` | `Promise<string \| undefined>` | ✅ | ✅ |
| `hashedAuth(userId, hash)` | `Promise<string \| undefined>` | ✅ | ✅ |
| `logout()` | `Promise<void>` | ✅ | ✅ |
| `openChat()` | `Promise<void>` | ✅ | ✅ |
| `closeChat()` | `Promise<void>` | ✅ | — |
| `isChatOpen()` | `boolean` | ✅ | — |
| `onChatVisibilityChanged(cb)` | `Subscription` | ✅ | close only |
| `setTheme(theme)` | `void` | ✅ | ✅ |
| `getUnreadConversationsCount()` | `Promise<number>` | ✅ | ✅ |
| `getUnreadMessagesCount()` | `Promise<number \| undefined>` | ✅ | — |
| `onUnreadConversationsChanged(cb)` | `Subscription` | — | ✅ |
| `setUserProperties(props)` | `void` | ✅ | ✅ |
| `setProperties(list)` | `void` | ✅ | ✅ |
| `trackEvent(name, params?)` | `void` | ✅ | ✅ |
| `trackScreen(name)` | `void` | ✅ | ✅ |
| `trackUtm(url)` | `void` | ✅ | ✅ |
| `setPushToken(token)` | `void` | ✅ | ✅ |
| `deletePushToken()` | `void` | ✅ | — |
| `pushNotificationsUnsubscribe()` | `Promise<void>` | ✅ | ✅ |
| `pushCampaignsUnsubscribe()` | `Promise<void>` | ✅ | ✅ |
| `isCarrotPush(payload)` | `boolean` | ✅ | ✅ |
| `isAutoMessage(payload)` | `boolean` | best effort | ✅ |
| `handlePushNotification(payload)` | `void` | ✅ | ✅ |
| `handlePushClick(payload, openLink?)` | `void` | ✅ | — |
| `getPushLink(payload)` | `string \| undefined` | best effort | — |
| `wasPushShownEarlier(payload)` | `Promise<boolean>` | ✅ | — |
| `onUrlOpen(source, cb)` | `Subscription` | ✅ | — |
| `openBrowserLink(url)` / `openUniversalLink(url)` | `void` | ✅ | — |
| `getDiagnostics()` | `string \| undefined` | ✅ | ✅ |
| `onLog(cb)` | `Subscription` | ✅ | ✅ |

Methods that cannot meaningfully fail are synchronous and return `void`. Methods
that can fail return a `Promise` so you get the error. A `—` means the platform's
SDK has no equivalent; those calls are inert rather than throwing.

### Forwarding SDK logs

Both platforms (iOS needs `CarrotquestSDK` 3.4+). Useful for routing the SDK's
own diagnostics into your crash reporter:

```ts
import { onLog } from 'react-native-carrot-quest';

const subscription = onLog((entry) => {
  if (entry.level === 'error') {
    Sentry.captureMessage(`[carrot/${entry.category}] ${entry.message}`);
  }
});
```

Entries are filtered by `logLevel`, so keep that at `info` or lower in
production — `verbose` crosses the bridge for every network call. Values are
redacted unless `logIncludeSensitive` is on.

Removing the last `onLog` subscription detaches the native sink, so log traffic
stops crossing the bridge entirely; the next subscription re-attaches it.

### Not wrapped

**The iOS floating chat button** (`showButton(in:)`, `hideButton()`,
`setButton(icon:)`). `showButton` takes a `UIView`, so exposing it properly means
shipping a Nitro **view** component rather than a hybrid object. Open an issue if
you need it.

### `CarrotQuestSetupOptions`

| Option | Platform | Description |
|---|---|---|
| `locale` | both | Force a UI locale, e.g. `'ru'`. See [Locale forcing](#locale-forcing) |
| `theme` | both | `light`, `dark`, `fromDevice`, `fromWeb` |
| `useEuServer` | both | Route to Carrot's EU servers. See the caveat below |
| `appGroup` | iOS | App Group shared with your Notification Service Extension |
| `isServiceMode` | iOS | Run without UI, inside an extension process |
| `parentActivityClassName` | Android | Activity the chat returns to on close |
| `notificationIconResourceName` | Android | Drawable *name* for push notifications |
| `logLevel` | Android | `none`, `error`, `warn`, `info`, `debugging`, `verbose` |
| `logIncludeSensitive` | Android | Allow tokens/user ids into SDK logs |

> **`useEuServer` on Android is inferred, not documented.** The SDK is obfuscated;
> the flag maps to the four-argument `setup(context, key, boolean, callback)`
> overload, identified from the neighbouring `isUseEuApi()` accessor. Verify your
> traffic routing before relying on it. Leaving the option unset uses the
> three-argument overload, so default behaviour is unaffected.

### Locale forcing

The Carrot SDKs resolve their language from the system locale and expose no
public `setLanguage` API. Passing `locale` works around that, but it is a blunt
instrument:

- **iOS** writes `AppleLanguages` / `AppleLocale` in `UserDefaults`
- **Android** calls `Locale.setDefault`, which is **process-global** and affects
  every locale-sensitive API in your app, not just Carrot

Only set it if you need to pin the chat to one language.

## SDK versions

| Platform | Pinned |
|---|---|
| iOS | `CarrotquestSDK ~> 3.4` (verified against 3.4.0) |
| Android | `io.carrotquest:android-sdk:3.4.2-commonRelease` |

Upgrading an existing iOS app: run `pod update CarrotquestSDK` — a Podfile.lock
pinned to 3.1–3.3 will not move on its own, and 3.4+ is required for the log and
diagnostics APIs.

Carrot publishes one Android artifact per region flavour — `commonRelease` or
`usRelease`. Override from your app's `android/build.gradle`:

```gradle
ext { carrotSdkVersion = "3.4.2-usRelease" }
```

**Android 2.x is not supported.** It exposes a callback-free `setup()` that
reports success before initialisation finishes, a `setDebug()` toggle that 3.x
replaced with `setLogLevel`, and JSON-string event params that 3.x replaced with
`EventParams`.

### Guarding against drift

`yarn test` fails if a version pin moves without the verified version in
`scripts/native-api.json` being updated to match. Maintainers can additionally
check every native symbol against the real SDK artifacts — see
[CONTRIBUTING.md](CONTRIBUTING.md#verifying-the-native-sdk-surface).

## Platform support

iOS and Android only. Importing on web resolves to a stub: predicates answer
`false`/`undefined` and everything else throws, so you can guard with
`Platform.OS` without breaking bundling.

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
