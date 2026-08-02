import Foundation
import CarrotSDK

/// Native entry point for initialising the Carrot quest SDK at app launch.
///
/// Call this from `AppDelegate` when you want the SDK ready before the JS
/// bundle finishes loading. Apps that do not care about launch timing can skip
/// it and call `setup()` from JS instead.
///
/// ```swift
/// // AppDelegate.swift
/// CarrotQuestSetup.configure(apiKey: "your-key", locale: "ru")
/// ```
///
/// Initialisation is single-flight: concurrent calls — including a native
/// launch-time init racing a JS `setup()` — join the in-flight attempt instead
/// of starting a second one, and every caller is notified when it settles.
@objc public final class CarrotQuestSetup: NSObject {

  /// The options that decide *which account and server* the SDK talks to.
  ///
  /// Everything else (theme) is applied after initialisation and can be
  /// changed freely, so it is not part of the conflict check.
  private struct Identity: Equatable {
    let apiKey: String
    let locale: String?
    let useEuServer: Bool
    let appGroup: String?
    let isServiceMode: Bool

    /// Human-readable list of what differs, for the conflict error.
    func differences(from other: Identity) -> [String] {
      var result: [String] = []
      if apiKey != other.apiKey { result.append("API key") }
      if locale != other.locale { result.append("locale") }
      if useEuServer != other.useEuServer { result.append("EU server flag") }
      if appGroup != other.appGroup { result.append("App Group") }
      if isServiceMode != other.isServiceMode { result.append("service mode") }
      return result
    }
  }

  private enum State {
    case idle
    case initializing(Identity)
    case configured(Identity)
  }

  private static let lock = NSLock()
  private static var state: State = .idle
  /// Callers waiting on the in-flight attempt. Drained exactly once when it
  /// settles.
  private static var pending: [(Error?) -> Void] = []
  private static var configuredAppGroup: String?
  /// Theme supplied by a caller that joined an in-flight init; applied on
  /// success so a later `setup` does not lose it.
  private static var pendingTheme: NSNumber?

  /// App Group recorded at setup. The notification helpers need it to reach
  /// the shared store written by the service extension.
  public static var appGroup: String? {
    lock.lock()
    defer { lock.unlock() }
    return configuredAppGroup
  }

  /// The API key the SDK was initialised with, once initialisation succeeded.
  public static var apiKey: String? {
    lock.lock()
    defer { lock.unlock() }

    if case .configured(let identity) = state {
      return identity.apiKey
    }

    return nil
  }

  /// Whether the SDK finished initialising successfully.
  @objc public static var isConfigured: Bool {
    return apiKey != nil
  }

  /// Initialise the SDK.
  ///
  /// Runs off the main thread — `Carrot.setup` performs I/O and would
  /// otherwise block the launch runloop. `completion` is called on an
  /// unspecified queue, once, when initialisation settles.
  ///
  /// - Parameters:
  ///   - apiKey: Your Carrot quest API key.
  ///   - locale: Optional locale override, e.g. `"ru"`. The SDK resolves its
  ///     language from the system locale and exposes no `setLanguage` API, so
  ///     this writes `AppleLanguages`/`AppleLocale` before `setup` runs.
  ///   - theme: Optional chat theme, applied on success.
  ///   - useEuServer: Route traffic to Carrot's EU servers.
  ///   - appGroup: App Group shared with your Notification Service Extension.
  ///   - isServiceMode: Run without UI, for use inside an extension process.
  @objc public static func configure(
    apiKey: String,
    locale: String? = nil,
    theme: NSNumber? = nil,
    useEuServer: Bool = false,
    appGroup: String? = nil,
    isServiceMode: Bool = false,
    completion: ((Error?) -> Void)? = nil
  ) {
    let identity = Identity(
      apiKey: apiKey,
      locale: locale,
      useEuServer: useEuServer,
      appGroup: appGroup,
      isServiceMode: isServiceMode
    )

    lock.lock()

    switch state {
    case .configured(let existing):
      lock.unlock()

      let conflict = self.conflict(between: existing, and: identity)

      if conflict == nil, let theme = theme {
        // Identity matches, so this is a re-configure rather than a second
        // init. Apply the mutable options instead of dropping them — a native
        // launch-time setup often has no theme, and the later JS call is where
        // it arrives.
        applyTheme(theme)
      }

      completion?(conflict)
      return

    case .initializing(let existing):
      if let conflict = conflict(between: existing, and: identity) {
        lock.unlock()
        completion?(conflict)
        return
      }

      // Join the in-flight attempt rather than initialising a second time, but
      // carry this caller's theme into it so it is not lost.
      if let theme = theme {
        pendingTheme = theme
      }

      if let completion = completion {
        pending.append(completion)
      }
      lock.unlock()
      return

    case .idle:
      state = .initializing(identity)
      configuredAppGroup = appGroup
      pendingTheme = theme
      if let completion = completion {
        pending.append(completion)
      }
      lock.unlock()
    }

    if let locale = locale {
      applyLocale(locale)
    }

    DispatchQueue.global(qos: .userInitiated).async {
      Carrot.shared.setup(
        withApiKey: apiKey,
        useEuServer: useEuServer,
        withAppGroup: appGroup,
        isServiceMode: isServiceMode,
        successHandler: {
          // Read the latest theme rather than the one captured at call time —
          // a caller that joined this attempt may have supplied a newer one.
          lock.lock()
          let theme = pendingTheme
          pendingTheme = nil
          lock.unlock()

          if let theme = theme {
            applyTheme(theme)
          }

          settle(state: .configured(identity), error: nil)
        },
        errorHandler: { message in
          NSLog("[CarrotQuest] setup failed: %@", message)
          settle(state: .idle, error: CarrotQuestError.setupFailed(message))
        }
      )
    }
  }

  /// Move out of `.initializing` and notify everyone who was waiting.
  ///
  /// On failure the state returns to `.idle` so a later call can retry.
  private static func settle(state newState: State, error: Error?) {
    lock.lock()
    state = newState
    let waiting = pending
    pending = []
    lock.unlock()

    for completion in waiting {
      completion(error)
    }
  }

  /// Apply a theme on an already-initialised SDK. Safe to call at any point
  /// after `setup` succeeds.
  private static func applyTheme(_ theme: NSNumber) {
    guard let value = Carrot.Theme(rawValue: theme.intValue) else { return }

    DispatchQueue.main.async {
      Carrot.shared.setTheme(value)
    }
  }

  /// Refuse to re-point a live SDK at a different account or server.
  ///
  /// Silently keeping the first configuration would let a second `setup` call
  /// resolve successfully while data continued flowing to the wrong Carrot
  /// account.
  private static func conflict(between existing: Identity, and requested: Identity) -> Error? {
    let differences = existing.differences(from: requested)

    guard !differences.isEmpty else { return nil }

    return CarrotQuestError.configurationConflict(differences.joined(separator: ", "))
  }

  /// Override the process locale so the SDK picks up the right language.
  ///
  /// Must run before `Carrot.setup`. This mutates `UserDefaults` app-wide.
  private static func applyLocale(_ locale: String) {
    UserDefaults.standard.set([locale], forKey: "AppleLanguages")
    UserDefaults.standard.set(locale, forKey: "AppleLocale")
  }
}

enum CarrotQuestError: LocalizedError {
  case setupFailed(String)
  case notConfigured
  case authFailed(String)
  case logoutFailed(String)
  case noPresentingWindow
  case invalidPayload
  case configurationConflict(String)

  var errorDescription: String? {
    switch self {
    case .setupFailed(let message):
      return "Carrot quest setup failed: \(message)"
    case .notConfigured:
      return
        "Carrot quest is not configured. Await setup() first, or call CarrotQuestSetup.configure(apiKey:) from AppDelegate."
    case .authFailed(let message):
      return "Carrot quest auth failed: \(message)"
    case .logoutFailed(let message):
      return "Carrot quest logout failed: \(message)"
    case .noPresentingWindow:
      return "Carrot quest could not open the chat: no active window."
    case .invalidPayload:
      return "Carrot quest could not decode the notification payload as a JSON object."
    case .configurationConflict(let differences):
      return
        "Carrot quest is already initialised with a different \(differences). The SDK cannot be re-pointed at another account or server at runtime; restart the process to change it."
    }
  }
}
