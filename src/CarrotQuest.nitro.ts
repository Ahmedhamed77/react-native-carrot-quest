import type { HybridObject } from 'react-native-nitro-modules';

/**
 * Chat colour theme.
 *
 * `fromDevice` follows the device's light/dark setting (`Theme.fromMobile` on
 * iOS, `ThemeSdk.FROM_DEVICE` on Android). `fromWeb` uses whatever is
 * configured in your Carrot quest web dashboard.
 */
export type CarrotQuestTheme = 'light' | 'dark' | 'fromDevice' | 'fromWeb';

/**
 * Android SDK log level, in increasing verbosity. Android only — the iOS SDK
 * exposes no logging control.
 *
 * `debugging` maps to the SDK's `DEBUG` level. It is spelled out rather than
 * abbreviated because Nitro derives a C++ enum member from each value, and
 * `DEBUG` is a preprocessor macro in React Native's Debug configuration — the
 * generated header would not compile in any app that includes it.
 */
export type CarrotQuestLogLevel =
  'none' | 'error' | 'warn' | 'info' | 'debugging' | 'verbose';

/**
 * Which subsystem produced a log entry. Mirrors Android's `SdkLogCategory`.
 */
export type CarrotQuestLogCategory =
  | 'general'
  | 'network'
  | 'connectivity'
  | 'auth'
  | 'realtime'
  | 'lifecycle'
  | 'database'
  | 'push';

/**
 * A single log line emitted by the native SDK. Android only.
 */
export interface CarrotQuestLogEntry {
  /** Milliseconds since the Unix epoch. */
  timestampMs: number;
  level: CarrotQuestLogLevel;
  category: CarrotQuestLogCategory;
  tag: string;
  message: string;
  /** Structured context, stringified. Empty when the entry carries none. */
  fields: Record<string, string>;
  /** Description of an attached throwable, when the entry has one. */
  error?: string;
}

/**
 * How a property value is merged with any existing value.
 *
 * Mirrors `UserProperty.Operations` (iOS) / `Operation` (Android).
 */
export type CarrotQuestPropertyOperation =
  | 'updateOrCreate'
  | 'setOnce'
  | 'add'
  | 'delete'
  | 'append'
  | 'union'
  | 'exclude';

/**
 * Which of the SDK's typed property namespaces a key belongs to.
 *
 * - `custom` — a free-form property (default)
 * - `system` — one of `name`, `phone`, `email`
 * - `ecommerce` — one of the {@link CarrotQuestEcommerceProperty} keys
 */
export type CarrotQuestPropertyKind = 'custom' | 'system' | 'ecommerce';

/**
 * Which links the SDK should hand to your own handler instead of opening
 * itself. Mirrors `CustomUrlOpener.UrlType` on iOS.
 */
export type CarrotQuestUrlSource = 'push' | 'chat' | 'popup' | 'all';

/**
 * A value an event parameter can carry.
 *
 * Android's `EventParams.Builder` accepts strings, booleans, ints, longs and
 * doubles; iOS takes an untyped params dictionary. Values keep their JSON type
 * on the wire rather than being stringified.
 */
export type CarrotQuestEventValue = string | number | boolean;

/**
 * Predefined e-commerce property keys, mapped to the SDK's
 * `EcommerceUserProperty.Property` enum on both platforms.
 */
export type CarrotQuestEcommerceProperty =
  | 'cartAmount'
  | 'viewedProducts'
  | 'cartItems'
  | 'lastOrderStatus'
  | 'lastPayment'
  | 'revenue'
  | 'profit'
  | 'group'
  | 'discount'
  | 'ordersCount'
  | 'orderedItems'
  | 'orderedCategories'
  | 'viewedCategories';

/**
 * A single user property with full control over its namespace and merge
 * operation. Use {@link CarrotQuest.setProperties} to send a batch.
 */
export interface CarrotQuestProperty {
  /**
   * For `kind: 'system'` one of `name` / `phone` / `email`; for
   * `kind: 'ecommerce'` a {@link CarrotQuestEcommerceProperty}; otherwise any
   * free-form key.
   */
  key: string;
  value: string;
  /** Defaults to `updateOrCreate`. */
  operation?: CarrotQuestPropertyOperation;
  /** Defaults to `custom`. */
  kind?: CarrotQuestPropertyKind;
}

/**
 * The ergonomic subset of user properties.
 *
 * `name`, `phone` and `email` map to the SDK's predefined system properties.
 * Everything in `custom` is sent as a free-form property. Empty strings are
 * dropped rather than written as blank values. For merge operations or
 * e-commerce keys use {@link CarrotQuest.setProperties} instead.
 */
export interface CarrotQuestUserProperties {
  name?: string;
  phone?: string;
  email?: string;
  custom?: Record<string, string>;
}

/**
 * Options applied when the Carrot quest SDK is initialised.
 */
export interface CarrotQuestSetupOptions {
  /**
   * Force a locale for the Carrot SDK UI, e.g. `'ru'`.
   *
   * The SDK has no public `setLanguage` API and resolves its language from the
   * system locale, so this is applied by overriding the process locale before
   * `setup` runs. On Android this calls `Locale.setDefault`, which is
   * process-global and affects the whole app.
   *
   * Leave unset to follow the device language.
   */
  locale?: string;
  /** Chat colour theme. Defaults to the SDK's own default when unset. */
  theme?: CarrotQuestTheme;
  /**
   * Route traffic to Carrot's EU servers.
   *
   * On iOS this maps to the documented `useEuServer` setup parameter. On
   * Android it selects the four-argument `setup(context, key, boolean,
   * callback)` overload — the SDK is obfuscated and that flag is *inferred*
   * from the neighbouring `isUseEuApi()` accessor rather than documented, so
   * verify the routing before relying on it. When this option is unset the
   * three-argument overload is used and behaviour is unchanged.
   */
  useEuServer?: boolean;
  /**
   * App Group identifier shared with your Notification Service Extension.
   * Required for rich pushes and duplicate suppression. iOS only.
   */
  appGroup?: string;
  /**
   * Run the SDK in service mode (no UI), for use inside an extension process.
   * iOS only.
   */
  isServiceMode?: boolean;
  /**
   * Fully-qualified activity class name the chat returns to when it closes,
   * e.g. `'com.example.MainActivity'`. Android only.
   */
  parentActivityClassName?: string;
  /**
   * Drawable resource *name* (not id) used for the push notification icon,
   * e.g. `'ic_notification'`. Resolved with `Resources.getIdentifier`.
   * Android only.
   */
  notificationIconResourceName?: string;
  /** SDK log level. Android only. */
  logLevel?: CarrotQuestLogLevel;
  /**
   * Allow sensitive values (tokens, user ids) into SDK logs. Android only.
   * Leave off in production.
   */
  logIncludeSensitive?: boolean;
}

export interface CarrotQuest extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  // MARK: - Lifecycle

  /**
   * Whether the SDK finished initialising successfully.
   *
   * This reflects the SDK's own state (`isInit()` on Android), not merely that
   * {@link setup} was called.
   */
  readonly isConfigured: boolean;

  /**
   * Initialise the SDK with your Carrot quest API key.
   *
   * Call this once from `index.js` or the root app component. Operations called
   * while setup is still in flight wait in the native setup queue, so consuming
   * apps do not need their own readiness promise or repeated setup calls.
   *
   * Resolves only once the SDK reports success. Concurrent matching setup calls
   * share a single initialisation and all resolve together.
   *
   * Rejects if the SDK reports a failure, e.g. an invalid API key or no
   * network.
   */
  setup(apiKey: string, options?: CarrotQuestSetupOptions): Promise<void>;

  /** The underlying native SDK version. */
  getSdkVersion(): string;

  // MARK: - Authentication

  /**
   * Authenticate with the User Auth Key — the **simple, less secure** flow.
   *
   * `userAuthKey` is the single key from your Carrot quest settings, stored in
   * the app itself and identical for every user. It is intended for apps with
   * no backend. Because the key ships inside the binary, anyone who extracts it
   * can authenticate as any user id.
   *
   * If you have a backend, use {@link hashedAuth} instead.
   *
   * Resolves with the Carrot-side user id.
   */
  auth(userId: string, userAuthKey: string): Promise<string | undefined>;

  /**
   * Authenticate with a backend-generated hash — the **recommended secure**
   * flow.
   *
   * `hash` is generated per user on your server from your Carrot secret key,
   * which never leaves it. Prefer this over {@link auth} whenever you have a
   * backend.
   *
   * Resolves with the Carrot-side user id.
   */
  hashedAuth(userId: string, hash: string): Promise<string | undefined>;

  /** Sign the current user out and clear their local session. */
  logout(): Promise<void>;

  // MARK: - Chat UI

  /**
   * Present the chat UI. Rejects if the UI cannot be presented — on Android
   * when there is no foreground activity, on iOS when there is no key window.
   */
  openChat(): Promise<void>;

  /**
   * Dismiss the chat UI.
   *
   * iOS only — the Android SDK exposes no programmatic close. Resolves without
   * doing anything on Android.
   */
  closeChat(): Promise<void>;

  /**
   * Whether the chat UI is currently presented.
   *
   * iOS only; always `false` on Android, which exposes no equivalent.
   */
  readonly isChatOpen: boolean;

  /**
   * Observe chat visibility.
   *
   * On iOS this maps to `onVisibilityUIChanged` and fires for both open and
   * close. On Android only `setCloseChatCallback` exists, so the listener
   * fires with `false` on close and never with `true`.
   */
  onChatVisibilityChanged(listener: (visible: boolean) => void): void;

  /** Apply a colour theme to the chat UI. */
  setTheme(theme: CarrotQuestTheme): void;

  // MARK: - Unread state

  /**
   * Number of conversations with unread messages.
   *
   * iOS reads `getUnreadConversationsCount`; Android counts
   * `getUnreadConversations()`.
   */
  getUnreadConversationsCount(): Promise<number>;

  /**
   * Number of unread messages.
   *
   * iOS only — Android exposes conversations but not a message count.
   * Resolves with `undefined` on Android.
   */
  getUnreadMessagesCount(): Promise<number | undefined>;

  /**
   * Observe the unread conversation count.
   *
   * Android only, via `setUnreadConversationsCallback`. Never fires on iOS —
   * poll {@link getUnreadConversationsCount} there instead.
   */
  onUnreadConversationsChanged(listener: (count: number) => void): void;

  // MARK: - User properties

  /** Attach the common user properties. Fire-and-forget. */
  setUserProperties(properties: CarrotQuestUserProperties): void;

  /**
   * Attach properties with explicit merge operations and namespaces.
   * Fire-and-forget.
   */
  setProperties(properties: CarrotQuestProperty[]): void;

  // MARK: - Tracking

  /**
   * Track a named event.
   *
   * Values keep their JSON type: Android dispatches to the matching
   * `EventParams.Builder.put` overload and iOS passes them through the params
   * dictionary. Non-integral numbers go through as doubles.
   * Fire-and-forget.
   */
  trackEvent(
    name: string,
    params?: Record<string, CarrotQuestEventValue>
  ): void;

  /** Track a screen view. Fire-and-forget. */
  trackScreen(name: string): void;

  /**
   * Record UTM attribution from a campaign URL. Fire-and-forget.
   */
  trackUtm(url: string): void;

  // MARK: - Push notifications

  /**
   * Register the device push token.
   *
   * Pass the APNs token as a hex string on iOS, or the FCM token on Android.
   */
  setPushToken(token: string): void;

  /**
   * Clear the registered push token.
   *
   * iOS only — the Android SDK exposes no token deletion. No-op on Android.
   */
  deletePushToken(): void;

  /** Unsubscribe the current user from push notifications. */
  pushNotificationsUnsubscribe(): Promise<void>;

  /** Unsubscribe the current user from push campaigns. */
  pushCampaignsUnsubscribe(): Promise<void>;

  /**
   * Whether a notification payload originated from Carrot quest.
   *
   * `payloadJson` is the JSON-encoded remote message payload — `userInfo` on
   * iOS, the FCM data map on Android.
   */
  isCarrotPush(payloadJson: string): boolean;

  /**
   * Whether a Carrot payload is an automated message rather than a reply.
   *
   * **Android is SDK-backed; iOS is best effort.** Android calls
   * `Carrot.isAutoMessage`. The iOS SDK exposes no equivalent, so this reads a
   * `type` discriminator out of the payload — a shape inferred from Carrot's
   * messages, not a documented contract. Verify against your own payloads
   * before branching on it, and treat `false` as "unknown" on iOS.
   */
  isAutoMessage(payloadJson: string): boolean;

  /**
   * Hand a Carrot push payload to the SDK so it can present the notification.
   */
  handlePushNotification(payloadJson: string): void;

  /**
   * Report that the user tapped a Carrot notification.
   *
   * iOS only — on Android tapping is routed through the notification's own
   * pending intent. No-op on Android.
   *
   * @param openLink whether the SDK should follow the notification's link
   *   itself, or leave it to your {@link onUrlOpen} handler.
   */
  handlePushClick(payloadJson: string, openLink: boolean): void;

  /**
   * Extract the deep link from a Carrot push payload.
   *
   * **Best effort, iOS only.** The SDK's own accessor is
   * `getLink(from: UNNotificationResponse)`, and a `UNNotificationResponse`
   * cannot cross into JS — so this scans the payload for the link keys Carrot
   * is observed to use. Android SDK 3.1.0 removed its push-link accessor
   * entirely and always returns `undefined`.
   *
   * For a guaranteed link, call
   * `CarrotNotificationService.shared.getLink(from:)` from your own
   * `UNUserNotificationCenterDelegate` in native code, or let the SDK follow
   * the link itself via {@link handlePushClick} with `openLink: true`.
   */
  getPushLink(payloadJson: string): string | undefined;

  /**
   * Whether this notification was already shown, using the App Group store.
   *
   * iOS only; always `false` on Android. Requires
   * {@link CarrotQuestSetupOptions.appGroup}.
   */
  wasPushShownEarlier(payloadJson: string): Promise<boolean>;

  // MARK: - Deep links

  /**
   * Intercept links the SDK would otherwise open itself.
   *
   * iOS only — the Android SDK routes links through
   * {@link CarrotQuestSetupOptions.parentActivityClassName} and exposes no
   * equivalent hook. Never fires on Android.
   *
   * @param source which links to intercept: `push`, `chat`, `popup` or `all`.
   */
  onUrlOpen(
    source: CarrotQuestUrlSource,
    listener: (url: string) => void
  ): void;

  /** Ask the SDK to open a URL in the in-app browser. iOS only. */
  openBrowserLink(url: string): void;

  /** Ask the SDK to open a URL as a universal link. iOS only. */
  openUniversalLink(url: string): void;

  // MARK: - Diagnostics

  /**
   * A formatted dump of the SDK's internal state and recent logs.
   *
   * Android only, via `getDiagnostics()`. Returns `undefined` on iOS.
   */
  getDiagnostics(): string | undefined;

  /**
   * Receive the SDK's log entries, e.g. to forward them to a crash reporter.
   *
   * Android only, via `setLogSink`. Never fires on iOS, whose SDK exposes no
   * logging hook.
   *
   * Entries are filtered by {@link CarrotQuestSetupOptions.logLevel}, so leave
   * that at `info` or lower in production — `verbose` crosses the bridge for
   * every network call. Values are redacted unless
   * {@link CarrotQuestSetupOptions.logIncludeSensitive} is on.
   */
  onLog(listener: (entry: CarrotQuestLogEntry) => void): void;

  /**
   * Detach the log listener installed by {@link onLog}.
   *
   * Called by the package's subscription registry when the last `onLog`
   * subscriber is removed — without it the SDK would keep pushing every log
   * line across the bridge to nobody. You should not need to call it directly;
   * use the subscription returned by the package's `onLog` instead.
   */
  offLog(): void;
}
