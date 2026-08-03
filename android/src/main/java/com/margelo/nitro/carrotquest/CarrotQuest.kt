package com.margelo.nitro.carrotquest

import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import io.carrotquest_sdk.android.Callback
import io.carrotquest_sdk.android.Carrot
import io.carrotquest_sdk.android.core.logging.SdkLogCategory
import io.carrotquest_sdk.android.core.logging.SdkLogLevel
import io.carrotquest_sdk.android.core.logging.SdkLogSink
import io.carrotquest_sdk.android.core.main.ThemeSdk
import io.carrotquest_sdk.android.models.CarrotUserProperty
import io.carrotquest_sdk.android.models.EcommerceUserProperty
import io.carrotquest_sdk.android.models.EventParams
import io.carrotquest_sdk.android.models.Operation
import io.carrotquest_sdk.android.models.UserProperty
import org.json.JSONObject

/**
 * Kotlin implementation of the `CarrotQuest` hybrid object.
 *
 * Targets Carrot Android SDK 3.x. The 2.x line is not supported: it exposes a
 * callback-free `setup`, a `setDebug` toggle and JSON-string event params, all
 * of which 3.x removed.
 */
@DoNotStrip
class CarrotQuest : HybridCarrotQuestSpec() {

  // MARK: - Lifecycle

  override val isConfigured: Boolean
    get() = CarrotQuestSetup.isConfigured

  override fun setup(apiKey: String, options: CarrotQuestSetupOptions?): Promise<Unit> {
    val promise = Promise<Unit>()

    val context = NitroModules.applicationContext

    if (context == null) {
      promise.reject(IllegalStateException("No React application context available."))
      return promise
    }

    CarrotQuestSetup.configure(
      context = context,
      apiKey = apiKey,
      locale = options?.locale,
      theme = options?.theme?.let(::nativeTheme),
      useEuServer = options?.useEuServer,
      parentActivityClassName = options?.parentActivityClassName,
      notificationIconResourceName = options?.notificationIconResourceName,
      logLevel = options?.logLevel?.let(::nativeLogLevel),
      logIncludeSensitive = options?.logIncludeSensitive,
    ) { error ->
      if (error == null) promise.resolve(Unit) else promise.reject(error)
    }

    return promise
  }

  override fun getSdkVersion(): String = Carrot.getVersion()

  /** Keep setup readiness inside the native package, never in consuming apps. */
  private fun <T> whenConfigured(promise: Promise<T>, operation: () -> Unit) {
    CarrotQuestSetup.whenConfigured ready@ { error ->
      if (error != null) {
        promise.reject(error)
        return@ready
      }

      try {
        operation()
      } catch (operationError: Throwable) {
        promise.reject(operationError)
      }
    }
  }

  // MARK: - Authentication

  override fun auth(userId: String, userAuthKey: String): Promise<String?> {
    return authenticate { callback -> Carrot.auth(userId, userAuthKey, callback) }
  }

  override fun hashedAuth(userId: String, hash: String): Promise<String?> {
    return authenticate { callback -> Carrot.hashedAuth(userId, hash, callback) }
  }

  /** Shared plumbing for the two auth flows. */
  private fun authenticate(call: (Callback<String>) -> Unit): Promise<String?> {
    val promise = Promise<String?>()

    whenConfigured(promise) {
      call(
        object : Callback<String> {
          override fun onResponse(result: String?) {
            promise.resolve(result)
          }

          override fun onFailure(t: Throwable) {
            promise.reject(t)
          }
        },
      )
    }

    return promise
  }

  override fun logout(): Promise<Unit> {
    val promise = Promise<Unit>()

    whenConfigured(promise) {
      Carrot.deInit(
        object : Callback<Boolean> {
          override fun onResponse(result: Boolean?) {
            // The SDK signals success with `true`. Reinitialising on anything
            // else would leave the previous user authenticated while logout()
            // resolved.
            if (result != true) {
              promise.reject(CarrotQuestLogoutRejectedException())
              return
            }

            // deInit tears the SDK down completely, so it has to be set up again
            // before the next auth call can succeed. Only report success once
            // that re-initialisation has actually settled.
            CarrotQuestSetup.reinitialiseAfterLogout { error ->
              if (error == null) promise.resolve(Unit) else promise.reject(error)
            }
          }

          override fun onFailure(t: Throwable) {
            promise.reject(t)
          }
        },
      )
    }

    return promise
  }

  // MARK: - Chat UI

  override fun openChat(): Promise<Unit> {
    val promise = Promise<Unit>()

    whenConfigured(promise) operation@ {
      val activity = NitroModules.applicationContext?.currentActivity

      if (activity == null) {
        promise.reject(CarrotQuestNoActivityException())
        return@operation
      }

      activity.runOnUiThread {
        try {
          Carrot.openChat(activity)
          promise.resolve(Unit)
        } catch (error: Throwable) {
          promise.reject(error)
        }
      }
    }

    return promise
  }

  override fun closeChat(): Promise<Unit> {
    // iOS-only: the Android SDK exposes no programmatic close, only the
    // close callback wired up in onChatVisibilityChanged.
    return Promise.resolved(Unit)
  }

  override val isChatOpen: Boolean
    get() = false // iOS-only; the Android SDK exposes no visibility getter.

  override fun onChatVisibilityChanged(listener: (visible: Boolean) -> Unit) {
    CarrotQuestSetup.runWhenConfigured("onChatVisibilityChanged") {
      // Android only signals close, never open — documented on the spec.
      Carrot.setCloseChatCallback(
        object : Callback<Boolean> {
          override fun onResponse(result: Boolean?) {
            listener(false)
          }

          override fun onFailure(t: Throwable) = Unit
        },
      )
    }
  }

  override fun setTheme(theme: CarrotQuestTheme) {
    CarrotQuestSetup.runWhenConfigured("setTheme") {
      Carrot.setTheme(nativeTheme(theme))
    }
  }

  private fun nativeTheme(theme: CarrotQuestTheme): ThemeSdk = when (theme) {
    CarrotQuestTheme.LIGHT -> ThemeSdk.LIGHT
    CarrotQuestTheme.DARK -> ThemeSdk.DARK
    CarrotQuestTheme.FROMDEVICE -> ThemeSdk.FROM_DEVICE
    CarrotQuestTheme.FROMWEB -> ThemeSdk.FROM_WEB
  }

  private fun nativeLogLevel(level: CarrotQuestLogLevel): SdkLogLevel = when (level) {
    CarrotQuestLogLevel.NONE -> SdkLogLevel.NONE
    CarrotQuestLogLevel.ERROR -> SdkLogLevel.ERROR
    CarrotQuestLogLevel.WARN -> SdkLogLevel.WARN
    CarrotQuestLogLevel.INFO -> SdkLogLevel.INFO
    CarrotQuestLogLevel.DEBUGGING -> SdkLogLevel.DEBUG
    CarrotQuestLogLevel.VERBOSE -> SdkLogLevel.VERBOSE
  }

  // MARK: - Unread state

  override fun getUnreadConversationsCount(): Promise<Double> {
    val promise = Promise<Double>()

    whenConfigured(promise) {
      promise.resolve(Carrot.getUnreadConversations().size.toDouble())
    }

    return promise
  }

  override fun getUnreadMessagesCount(): Promise<Double?> {
    // iOS-only: Android exposes unread conversations but not a message count.
    return Promise.resolved(null)
  }

  override fun onUnreadConversationsChanged(listener: (count: Double) -> Unit) {
    CarrotQuestSetup.runWhenConfigured("onUnreadConversationsChanged") {
      // The SDK declares Callback<List<String>> — a list of conversation ids.
      Carrot.setUnreadConversationsCallback(
        object : Callback<List<String>> {
          override fun onResponse(result: List<String>?) {
            listener((result?.size ?: 0).toDouble())
          }

          override fun onFailure(t: Throwable) = Unit
        },
      )
    }
  }

  // MARK: - User properties

  override fun setUserProperties(properties: CarrotQuestUserProperties) {
    val userProperties = makeUserProperties(properties)

    if (userProperties.isEmpty()) return

    CarrotQuestSetup.runWhenConfigured("setUserProperties") {
      Carrot.setUserProperty(userProperties)
    }
  }

  override fun setProperties(properties: Array<CarrotQuestProperty>) {
    val userProperties = properties.mapNotNull(::makeProperty)

    if (userProperties.isEmpty()) return

    CarrotQuestSetup.runWhenConfigured("setProperties") {
      Carrot.setUserProperty(userProperties)
    }
  }

  /**
   * Map the ergonomic struct onto Carrot's property types.
   *
   * Empty values are dropped rather than written as blank strings, and a
   * `custom` key that collides with a system property is ignored so the typed
   * field always wins.
   */
  private fun makeUserProperties(
    properties: CarrotQuestUserProperties,
  ): List<UserProperty> {
    val result = mutableListOf<UserProperty>()

    val systemProperties = listOf(
      Triple("name", CarrotUserProperty.Property.NAME, properties.name),
      Triple("phone", CarrotUserProperty.Property.PHONE, properties.phone),
      Triple("email", CarrotUserProperty.Property.EMAIL, properties.email),
    )

    val reservedKeys = systemProperties.map { it.first }.toSet()

    for ((_, key, value) in systemProperties) {
      if (value.isNullOrEmpty()) continue

      result.add(CarrotUserProperty(key, value))
    }

    properties.custom?.forEach { (key, value) ->
      if (key.isEmpty() || value.isEmpty()) return@forEach
      if (key in reservedKeys) return@forEach

      result.add(UserProperty(key, value))
    }

    return result
  }

  private fun makeProperty(property: CarrotQuestProperty): UserProperty? {
    if (property.key.isEmpty() || property.value.isEmpty()) return null

    val operation = nativeOperation(property.operation ?: CarrotQuestPropertyOperation.UPDATEORCREATE)

    return when (property.kind ?: CarrotQuestPropertyKind.CUSTOM) {
      CarrotQuestPropertyKind.SYSTEM -> systemKey(property.key)
        ?.let { CarrotUserProperty(operation, it, property.value) }
        // Unknown system key — fall back to a free-form property rather than
        // silently dropping the value.
        ?: UserProperty(operation, property.key, property.value)

      CarrotQuestPropertyKind.ECOMMERCE -> ecommerceKey(property.key)
        ?.let { EcommerceUserProperty(operation, it, property.value) }
        ?: UserProperty(operation, property.key, property.value)

      CarrotQuestPropertyKind.CUSTOM -> UserProperty(operation, property.key, property.value)
    }
  }

  /**
   * Map JS key names onto the SDK's enums explicitly rather than by name
   * lookup, so a rename in either direction is a compile error here.
   *
   * Android's [CarrotUserProperty.Property] only covers name/phone/email; the
   * push and UTM keys iOS exposes as typed cases are plain custom keys here.
   */
  private fun systemKey(key: String): CarrotUserProperty.Property? = when (key) {
    "name" -> CarrotUserProperty.Property.NAME
    "phone" -> CarrotUserProperty.Property.PHONE
    "email" -> CarrotUserProperty.Property.EMAIL
    else -> null
  }

  private fun ecommerceKey(key: String): EcommerceUserProperty.Property? = when (key) {
    "cartAmount" -> EcommerceUserProperty.Property.CART_AMOUNT
    "viewedProducts" -> EcommerceUserProperty.Property.VIEWED_PRODUCTS
    "cartItems" -> EcommerceUserProperty.Property.CART_ITEMS
    "lastOrderStatus" -> EcommerceUserProperty.Property.LAST_ORDER_STATUS
    "lastPayment" -> EcommerceUserProperty.Property.LAST_PAYMENT
    "revenue" -> EcommerceUserProperty.Property.REVENUE
    "profit" -> EcommerceUserProperty.Property.PROFIT
    "group" -> EcommerceUserProperty.Property.GROUP
    "discount" -> EcommerceUserProperty.Property.DISCOUNT
    "ordersCount" -> EcommerceUserProperty.Property.ORDERS_COUNT
    "orderedItems" -> EcommerceUserProperty.Property.ORDERED_ITEMS
    "orderedCategories" -> EcommerceUserProperty.Property.ORDERED_CATEGORIES
    "viewedCategories" -> EcommerceUserProperty.Property.VIEWED_CATEGORIES
    else -> null
  }

  private fun nativeOperation(operation: CarrotQuestPropertyOperation): Operation =
    when (operation) {
      CarrotQuestPropertyOperation.UPDATEORCREATE -> Operation.UPDATE_OR_CREATE
      CarrotQuestPropertyOperation.SETONCE -> Operation.SET_ONCE
      CarrotQuestPropertyOperation.ADD -> Operation.ADD
      CarrotQuestPropertyOperation.DELETE -> Operation.DELETE
      CarrotQuestPropertyOperation.APPEND -> Operation.APPEND
      CarrotQuestPropertyOperation.UNION -> Operation.UNION
      CarrotQuestPropertyOperation.EXCLUDE -> Operation.EXCLUDE
    }

  // MARK: - Tracking

  override fun trackEvent(name: String, params: Map<String, CarrotQuestEventValue>?) {
    if (name.isEmpty()) return

    CarrotQuestSetup.runWhenConfigured("trackEvent") {
      if (params.isNullOrEmpty()) {
        Carrot.trackEvent(name)
      } else {
        // SDK 3.x replaced the JSON-string overload with a typed EventParams,
        // so values keep their JSON type instead of being stringified.
        val builder = EventParams.builder()

        params.forEach { (key, value) ->
          when (value) {
            is CarrotQuestEventValue.First -> builder.put(key, value.value)
            is CarrotQuestEventValue.Second -> builder.put(key, value.value)
            is CarrotQuestEventValue.Third -> putNumber(builder, key, value.value)
          }
        }

        Carrot.trackEvent(name, builder.build())
      }
    }
  }

  /**
   * JS has a single number type, so every numeric arrives as a Double. Send
   * whole numbers as Long to avoid `1` turning into `1.0` on the wire.
   */
  private fun putNumber(builder: EventParams.Builder, key: String, value: Double) {
    val isWhole = value.isFinite() && value == Math.floor(value) &&
      value >= Long.MIN_VALUE.toDouble() && value <= Long.MAX_VALUE.toDouble()

    if (isWhole) {
      builder.put(key, value.toLong())
    } else {
      builder.put(key, value)
    }
  }

  override fun trackScreen(name: String) {
    if (name.isEmpty()) return

    CarrotQuestSetup.runWhenConfigured("trackScreen") {
      Carrot.trackScreen(name)
    }
  }

  override fun trackUtm(url: String) {
    if (url.isEmpty()) return

    Carrot.trackUtm(url)
  }

  // MARK: - Push notifications

  override fun setPushToken(token: String) {
    if (token.isEmpty()) return

    CarrotQuestSetup.runWhenConfigured("setPushToken") {
      Carrot.sendPushToken(token)
    }
  }

  override fun deletePushToken() {
    // iOS-only: the Android SDK exposes no token deletion.
  }

  override fun pushNotificationsUnsubscribe(): Promise<Unit> {
    return runCatchingPromise { Carrot.pushNotificationsUnsubscribe() }
  }

  override fun pushCampaignsUnsubscribe(): Promise<Unit> {
    return runCatchingPromise { Carrot.pushCampaignsUnsubscribe() }
  }

  override fun isCarrotPush(payloadJson: String): Boolean {
    val payload = decodePayload(payloadJson) ?: return false

    return runCatching { Carrot.isCarrotPush(payload) }.getOrDefault(false)
  }

  override fun isAutoMessage(payloadJson: String): Boolean {
    val payload = decodePayload(payloadJson) ?: return false

    return runCatching { Carrot.isAutoMessage(payload) }.getOrDefault(false)
  }

  override fun handlePushNotification(payloadJson: String) {
    val payload = decodePayload(payloadJson) ?: throw CarrotQuestInvalidPayloadException()
    val context = NitroModules.applicationContext ?: return

    CarrotQuestSetup.runWhenConfigured("handlePushNotification") {
      Carrot.sendPushNotification(payload, context)
    }
  }

  override fun handlePushClick(payloadJson: String, openLink: Boolean) {
    // iOS-only: on Android the tap is routed through the notification's own
    // pending intent, which the SDK builds itself.
  }

  override fun getPushLink(payloadJson: String): String? {
    // SDK 3.x removed getPushActionUrl and offers no replacement accessor.
    return null
  }

  override fun wasPushShownEarlier(payloadJson: String): Promise<Boolean> {
    // iOS-only: duplicate suppression relies on the App Group store, which has
    // no Android equivalent.
    return Promise.resolved(false)
  }

  /**
   * Decode a JSON payload into the string map the SDK's push helpers expect.
   *
   * Nested values are re-encoded rather than flattened, matching how FCM
   * delivers a data payload.
   */
  private fun decodePayload(payloadJson: String): Map<String, String>? {
    if (payloadJson.isEmpty()) return null

    return runCatching {
      val json = JSONObject(payloadJson)
      val result = mutableMapOf<String, String>()

      json.keys().forEach { key ->
        val value = json.get(key)
        result[key] = if (value is JSONObject || value is org.json.JSONArray) {
          value.toString()
        } else {
          value.toString()
        }
      }

      result
    }.getOrNull()
  }

  private fun runCatchingPromise(block: () -> Unit): Promise<Unit> {
    val promise = Promise<Unit>()

    whenConfigured(promise) {
      block()
      promise.resolve(Unit)
    }

    return promise
  }

  // MARK: - Deep links

  override fun onUrlOpen(source: CarrotQuestUrlSource, listener: (url: String) -> Unit) {
    // iOS-only: the Android SDK routes links through the parent activity and
    // exposes no interception hook.
  }

  override fun openBrowserLink(url: String) {
    // iOS-only.
  }

  override fun openUniversalLink(url: String) {
    // iOS-only.
  }

  // MARK: - Diagnostics

  override fun getDiagnostics(): String? {
    return runCatching { Carrot.getDiagnostics().toFormattedString() }.getOrNull()
  }

  override fun onLog(listener: (entry: CarrotQuestLogEntry) -> Unit) {
    Carrot.setLogSink(
      SdkLogSink { entry ->
        listener(
          CarrotQuestLogEntry(
            timestampMs = entry.timestampMs.toDouble(),
            level = jsLogLevel(entry.level),
            category = jsLogCategory(entry.category),
            tag = entry.tag,
            message = entry.message,
            // Already Map<String, String>; orEmpty() only guards the platform
            // type, which Kotlin cannot prove non-null.
            fields = entry.fields.orEmpty(),
            error = entry.throwable?.toString(),
          ),
        )
      },
    )
  }

  override fun offLog() {
    // setLogSink takes a non-null sink, so detaching means installing an inert
    // one. The SDK keeps logging internally; what stops is the bridge traffic.
    Carrot.setLogSink(SdkLogSink { })
  }

  private fun jsLogLevel(level: SdkLogLevel): CarrotQuestLogLevel = when (level) {
    SdkLogLevel.NONE -> CarrotQuestLogLevel.NONE
    SdkLogLevel.ERROR -> CarrotQuestLogLevel.ERROR
    SdkLogLevel.WARN -> CarrotQuestLogLevel.WARN
    SdkLogLevel.INFO -> CarrotQuestLogLevel.INFO
    SdkLogLevel.DEBUG -> CarrotQuestLogLevel.DEBUGGING
    SdkLogLevel.VERBOSE -> CarrotQuestLogLevel.VERBOSE
  }

  private fun jsLogCategory(category: SdkLogCategory): CarrotQuestLogCategory =
    when (category) {
      SdkLogCategory.GENERAL -> CarrotQuestLogCategory.GENERAL
      SdkLogCategory.NETWORK -> CarrotQuestLogCategory.NETWORK
      SdkLogCategory.CONNECTIVITY -> CarrotQuestLogCategory.CONNECTIVITY
      SdkLogCategory.AUTH -> CarrotQuestLogCategory.AUTH
      SdkLogCategory.REALTIME -> CarrotQuestLogCategory.REALTIME
      SdkLogCategory.LIFECYCLE -> CarrotQuestLogCategory.LIFECYCLE
      SdkLogCategory.DATABASE -> CarrotQuestLogCategory.DATABASE
      SdkLogCategory.PUSH -> CarrotQuestLogCategory.PUSH
    }
}
