package com.margelo.nitro.carrotquest

import android.content.Context
import android.content.res.Configuration
import android.util.Log
import io.carrotquest_sdk.android.Callback
import io.carrotquest_sdk.android.Carrot
import io.carrotquest_sdk.android.core.logging.SdkLogLevel
import io.carrotquest_sdk.android.core.main.ThemeSdk
import java.util.Locale

/**
 * Native entry point for initialising the Carrot quest SDK at app launch.
 *
 * Call this from `Application.onCreate` when you want the SDK ready before the
 * JS bundle finishes loading. Apps that do not care about launch timing can
 * skip it and call `setup()` from JS instead.
 *
 * ```kotlin
 * // MainApplication.kt
 * CarrotQuestSetup.configure(this, apiKey = "your-key", locale = "ru") { error ->
 *   if (error != null) Log.e("App", "Carrot setup failed", error)
 * }
 * ```
 *
 * Initialisation is single-flight: concurrent calls that agree on the API key
 * and the account-critical options join the in-flight attempt instead of
 * starting a second one, and every caller is notified when it settles. Calls
 * that *disagree* fail with [CarrotQuestConfigurationConflictException] rather
 * than silently keeping the first configuration.
 *
 * `Carrot.setup` performs I/O, so call this off the main thread; this object
 * does not spawn its own thread, leaving the scheduler choice to the caller.
 */
object CarrotQuestSetup {
  private const val TAG = "CarrotQuest"

  /**
   * The options that decide *which account and server* the SDK talks to.
   *
   * Everything else (theme, parent activity, notification icon, log level) is
   * applied after initialisation and can be changed freely, so it is not part
   * of the conflict check.
   */
  private data class Identity(
    val apiKey: String,
    val locale: String?,
    val useEuServer: Boolean?,
  )

  private sealed interface State {
    object Idle : State
    data class Initializing(val identity: Identity) : State
    data class Configured(val identity: Identity) : State
  }

  private val lock = Any()
  private var state: State = State.Idle
  private var pending = mutableListOf<(Throwable?) -> Unit>()

  /** Application context the SDK was initialised with. Used to re-init after logout. */
  @Volatile
  private var appContext: Context? = null

  @Volatile
  private var lastOptions: Options? = null

  private data class Options(
    val identity: Identity,
    val theme: ThemeSdk?,
    val parentActivityClassName: String?,
    val notificationIconResourceName: String?,
    val logLevel: SdkLogLevel?,
    val logIncludeSensitive: Boolean?,
  )

  val apiKey: String?
    get() = synchronized(lock) { (state as? State.Configured)?.identity?.apiKey }

  /**
   * Whether the SDK finished initialising successfully.
   *
   * Prefers the SDK's own [Carrot.isInit] over our local bookkeeping so a
   * teardown inside the SDK is not reported as still-configured.
   */
  val isConfigured: Boolean
    get() = apiKey != null && runCatching { Carrot.isInit() }
      // Fail closed: if the SDK cannot report its own state, callers must not
      // be told it is ready.
      .onFailure { Log.w(TAG, "Carrot.isInit() threw; reporting not-configured", it) }
      .getOrDefault(false)

  /**
   * Initialise the SDK.
   *
   * @param context Any context; the application context is retained.
   * @param apiKey Your Carrot quest API key.
   * @param locale Optional locale override, e.g. `"ru"`. The SDK resolves its
   *   language from the system locale and exposes no `setLanguage` API, so this
   *   calls [Locale.setDefault], which is **process-global** and affects the
   *   whole app.
   * @param completion Invoked once, when initialisation settles. Receives
   *   [CarrotQuestConfigurationConflictException] if the SDK is already
   *   running under a different API key, locale or server.
   */
  @JvmStatic
  @JvmOverloads
  fun configure(
    context: Context,
    apiKey: String,
    locale: String? = null,
    theme: ThemeSdk? = null,
    useEuServer: Boolean? = null,
    parentActivityClassName: String? = null,
    notificationIconResourceName: String? = null,
    logLevel: SdkLogLevel? = null,
    logIncludeSensitive: Boolean? = null,
    completion: ((Throwable?) -> Unit)? = null,
  ) {
    val identity = Identity(apiKey, locale, useEuServer)

    val options = Options(
      identity = identity,
      theme = theme,
      parentActivityClassName = parentActivityClassName,
      notificationIconResourceName = notificationIconResourceName,
      logLevel = logLevel,
      logIncludeSensitive = logIncludeSensitive,
    )

    synchronized(lock) {
      when (val current = state) {
        is State.Configured -> {
          val conflict = conflictOrNull(current.identity, identity)

          if (conflict == null) {
            // Identity matches, so this is a re-configure rather than a second
            // init. Apply the mutable options instead of dropping them — a
            // native launch-time setup often has no theme, and the later JS
            // call is where it arrives.
            applyMutableOptions(context.applicationContext, options)
            lastOptions = mergeMutableOptions(options)
          }

          completion?.invoke(conflict)
          return
        }

        is State.Initializing -> {
          val conflict = conflictOrNull(current.identity, identity)

          if (conflict != null) {
            completion?.invoke(conflict)
            return
          }

          // Join the in-flight attempt rather than initialising a second time,
          // but carry this caller's options into it so they are not lost.
          lastOptions = mergeMutableOptions(options)
          completion?.let { pending.add(it) }
          return
        }

        State.Idle -> {
          state = State.Initializing(identity)
          // Publish under the lock. Assigning after releasing it would race a
          // joining caller's merge and clobber their options.
          appContext = context.applicationContext
          lastOptions = options
          completion?.let { pending.add(it) }
        }
      }
    }

    val applicationContext = context.applicationContext

    try {
      start(applicationContext, options) { error ->
        settle(if (error == null) State.Configured(identity) else State.Idle, error)
      }
    } catch (error: Throwable) {
      settle(State.Idle, error)
    }
  }

  /**
   * Fold a later call's mutable options over the recorded ones.
   *
   * Only options the caller actually supplied win, so a second `setup` that
   * omits a field does not clear what an earlier call set. Used to keep
   * [lastOptions] accurate for re-initialisation after logout.
   */
  private fun mergeMutableOptions(options: Options): Options {
    val previous = lastOptions ?: return options

    return previous.copy(
      identity = options.identity,
      theme = options.theme ?: previous.theme,
      parentActivityClassName =
        options.parentActivityClassName ?: previous.parentActivityClassName,
      notificationIconResourceName =
        options.notificationIconResourceName ?: previous.notificationIconResourceName,
      logLevel = options.logLevel ?: previous.logLevel,
      logIncludeSensitive = options.logIncludeSensitive ?: previous.logIncludeSensitive,
    )
  }

  /**
   * Apply the options that do not require a fresh initialisation.
   *
   * Safe to call on an already-running SDK; each setter is independent.
   */
  private fun applyMutableOptions(context: Context, options: Options) {
    runCatching {
      options.logLevel?.let { Carrot.setLogLevel(it) }
      options.logIncludeSensitive?.let { Carrot.setLogIncludeSensitive(it) }
      options.theme?.let { Carrot.setTheme(it) }
      options.parentActivityClassName?.let { Carrot.setParentActivityClassName(it) }
      options.notificationIconResourceName?.let { name ->
        resolveDrawable(context, name)?.let { Carrot.setNotificationIcon(it) }
      }
    }.onFailure { Log.w(TAG, "Re-applying setup options failed", it) }
  }

  /**
   * Refuse to re-point a live SDK at a different account or server.
   *
   * Silently keeping the first configuration would let a second `setup` call
   * resolve successfully while data continued flowing to the wrong Carrot
   * account.
   */
  private fun conflictOrNull(
    existing: Identity,
    requested: Identity,
  ): CarrotQuestConfigurationConflictException? {
    if (existing == requested) return null

    val differences = buildList {
      if (existing.apiKey != requested.apiKey) add("API key")
      if (existing.locale != requested.locale) add("locale")
      if (existing.useEuServer != requested.useEuServer) add("EU server flag")
    }

    return CarrotQuestConfigurationConflictException(differences.joinToString(", "))
  }

  private fun start(
    context: Context,
    options: Options,
    onSettled: (Throwable?) -> Unit,
  ) {
    val identity = options.identity

    val setupContext = identity.locale
      ?.let { applyLocale(context, it) }
      ?: context

    // Logging must be configured before setup so initialisation itself is
    // covered by the requested level.
    options.logLevel?.let { Carrot.setLogLevel(it) }
    options.logIncludeSensitive?.let { Carrot.setLogIncludeSensitive(it) }

    val callback = object : Callback<Boolean> {
      override fun onResponse(result: Boolean?) {
        // The SDK signals success with `true`; anything else is a failed
        // initialisation reported through the success channel.
        if (result != true) {
          onSettled(CarrotQuestSetupRejectedException())
          return
        }

        // Apply the settings that require an initialised SDK, then report.
        //
        // Read the merged options rather than the ones captured when this
        // attempt started: a caller that joined mid-flight may have supplied a
        // theme the first caller did not, and that is the whole point of the
        // documented native-init-then-JS-setup pattern.
        applyMutableOptions(context, lastOptions ?: options)

        onSettled(null)
      }

      override fun onFailure(t: Throwable) {
        Log.e(TAG, "setup failed", t)
        onSettled(t)
      }
    }

    // SDK 3.x removed the callback-free `setup(context, apiKey)` overload, so
    // there is no path here that reports success before the SDK is ready.
    // The four-argument overload is only used when the caller explicitly opts
    // into EU routing — see CarrotQuestSetupOptions.useEuServer.
    val useEuServer = identity.useEuServer

    if (useEuServer != null) {
      Carrot.setup(setupContext, identity.apiKey, useEuServer, callback)
    } else {
      Carrot.setup(setupContext, identity.apiKey, callback)
    }
  }

  /** Move out of Initializing and notify everyone who was waiting. */
  private fun settle(newState: State, error: Throwable?) {
    val waiting: List<(Throwable?) -> Unit>

    synchronized(lock) {
      state = newState
      waiting = pending.toList()
      pending = mutableListOf()
    }

    waiting.forEach { it(error) }
  }

  /**
   * Re-initialise after [Carrot.deInit]. The Android SDK tears down its whole
   * client on logout, so it has to be set up again before the next auth.
   *
   * @param completion invoked once re-initialisation settles.
   */
  internal fun reinitialiseAfterLogout(completion: (Throwable?) -> Unit) {
    val context = appContext
    val options = lastOptions
    val identity = synchronized(lock) { (state as? State.Configured)?.identity }

    if (context == null || options == null || identity == null) {
      completion(null)
      return
    }

    synchronized(lock) {
      state = State.Initializing(identity)
    }

    try {
      start(context, options) { error ->
        settle(if (error == null) State.Configured(identity) else State.Idle, error)
        completion(error)
      }
    } catch (error: Throwable) {
      settle(State.Idle, error)
      completion(error)
    }
  }

  private fun resolveDrawable(context: Context, name: String): Int? {
    val id = context.resources.getIdentifier(name, "drawable", context.packageName)

    if (id == 0) {
      Log.w(TAG, "Notification icon drawable '$name' not found; keeping the SDK default.")
      return null
    }

    return id
  }

  /**
   * Override the process locale so the SDK picks up the right language.
   *
   * Must run before `Carrot.setup`. [Locale.setDefault] is process-global, so
   * this affects every locale-sensitive API in the app, not just Carrot.
   */
  private fun applyLocale(context: Context, locale: String): Context {
    val target = Locale(locale)
    Locale.setDefault(target)

    val config = Configuration(context.resources.configuration)
    config.setLocale(target)

    return context.createConfigurationContext(config)
  }
}

internal class CarrotQuestNotConfiguredException : IllegalStateException(
  "Carrot quest is not configured. Await setup() first, or call CarrotQuestSetup.configure() from Application.onCreate."
)

internal class CarrotQuestNoActivityException : IllegalStateException(
  "Carrot quest could not open the chat: no foreground activity."
)

internal class CarrotQuestInvalidPayloadException : IllegalArgumentException(
  "Carrot quest could not decode the notification payload as a JSON object."
)

internal class CarrotQuestSetupRejectedException : IllegalStateException(
  "Carrot quest setup did not succeed. Check the API key and network connection."
)

internal class CarrotQuestLogoutRejectedException : IllegalStateException(
  "Carrot quest logout did not succeed; the previous user may still be authenticated."
)

internal class CarrotQuestConfigurationConflictException(differences: String) :
  IllegalStateException(
    "Carrot quest is already initialised with a different $differences. " +
      "The SDK cannot be re-pointed at another account or server at runtime; " +
      "restart the process to change it."
  )
