import Foundation
import CarrotSDK
import NitroModules
import UIKit

/// Swift implementation of the `CarrotQuest` hybrid object.
///
/// Note the whole file talks to `CarrotSDK` directly — no Objective-C bridging
/// header, no `objc_msgSend`, no `NSClassFromString`.
final class CarrotQuest: HybridCarrotQuestSpec {

  // MARK: - Lifecycle

  var isConfigured: Bool {
    return CarrotQuestSetup.isConfigured
  }

  func setup(apiKey: String, options: CarrotQuestSetupOptions?) throws -> Promise<Void> {
    let promise = Promise<Void>()

    CarrotQuestSetup.configure(
      apiKey: apiKey,
      locale: options?.locale,
      theme: options?.theme.map { NSNumber(value: Self.nativeTheme($0).rawValue) },
      useEuServer: options?.useEuServer ?? false,
      appGroup: options?.appGroup,
      isServiceMode: options?.isServiceMode ?? false
    ) { error in
      if let error = error {
        promise.reject(withError: error)
      } else {
        promise.resolve()
      }
    }

    return promise
  }

  func getSdkVersion() throws -> String {
    return Carrot.shared.version
  }

  // MARK: - Authentication

  func auth(userId: String, userAuthKey: String) throws -> Promise<String?> {
    return authenticate { successHandler, errorHandler in
      Carrot.shared.auth(
        withUserId: userId,
        withUserAuthKey: userAuthKey,
        successHandler: successHandler,
        errorHandler: errorHandler
      )
    }
  }

  func hashedAuth(userId: String, hash: String) throws -> Promise<String?> {
    return authenticate { successHandler, errorHandler in
      Carrot.shared.hashedAuth(
        withUserId: userId,
        withHash: hash,
        successHandler: successHandler,
        errorHandler: errorHandler
      )
    }
  }

  /// Shared plumbing for the two auth flows — they differ only in which SDK
  /// call they make.
  private func authenticate(
    _ call: (@escaping (String) -> Void, @escaping (String) -> Void) -> Void
  ) -> Promise<String?> {
    let promise = Promise<String?>()

    guard isConfigured else {
      promise.reject(withError: CarrotQuestError.notConfigured)
      return promise
    }

    call(
      { carrotId in promise.resolve(withResult: carrotId) },
      { message in promise.reject(withError: CarrotQuestError.authFailed(message)) }
    )

    return promise
  }

  func logout() throws -> Promise<Void> {
    let promise = Promise<Void>()

    guard isConfigured else {
      // Nothing to log out of. Treat as success so callers can log out
      // unconditionally during teardown.
      promise.resolve()
      return promise
    }

    Carrot.shared.logout(
      successHandler: {
        promise.resolve()
      },
      errorHandler: { message in
        promise.reject(withError: CarrotQuestError.logoutFailed(message))
      }
    )

    return promise
  }

  // MARK: - Chat UI

  func openChat() throws -> Promise<Void> {
    let promise = Promise<Void>()

    guard isConfigured else {
      promise.reject(withError: CarrotQuestError.notConfigured)
      return promise
    }

    DispatchQueue.main.async {
      guard Self.hasActiveWindow() else {
        promise.reject(withError: CarrotQuestError.noPresentingWindow)
        return
      }

      Carrot.shared.openChat()
      promise.resolve()
    }

    return promise
  }

  func closeChat() throws -> Promise<Void> {
    let promise = Promise<Void>()

    DispatchQueue.main.async {
      Carrot.shared.closeChat()
      promise.resolve()
    }

    return promise
  }

  var isChatOpen: Bool {
    return Carrot.shared.isOpen
  }

  func onChatVisibilityChanged(listener: @escaping (Bool) -> Void) throws {
    Carrot.shared.onVisibilityUIChanged { visible in
      listener(visible)
    }
  }

  func setTheme(theme: CarrotQuestTheme) throws {
    let native = Self.nativeTheme(theme)

    DispatchQueue.main.async {
      Carrot.shared.setTheme(native)
    }
  }

  private static func nativeTheme(_ theme: CarrotQuestTheme) -> Carrot.Theme {
    switch theme {
    case .light: return .light
    case .dark: return .dark
    // The SDK calls this `fromMobile`; Android calls the same concept
    // `FROM_DEVICE`, which is the name the JS API uses.
    case .fromdevice: return .fromMobile
    case .fromweb: return .fromWeb
    }
  }

  private static func hasActiveWindow() -> Bool {
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .contains { $0.isKeyWindow }
  }

  // MARK: - Unread state

  func getUnreadConversationsCount() throws -> Promise<Double> {
    let promise = Promise<Double>()

    guard isConfigured else {
      promise.reject(withError: CarrotQuestError.notConfigured)
      return promise
    }

    Carrot.shared.getUnreadConversationsCount { count in
      promise.resolve(withResult: Double(count))
    }

    return promise
  }

  func getUnreadMessagesCount() throws -> Promise<Double?> {
    let promise = Promise<Double?>()

    guard isConfigured else {
      promise.reject(withError: CarrotQuestError.notConfigured)
      return promise
    }

    Carrot.shared.getUnreadMessagesCount { count in
      promise.resolve(withResult: Double(count))
    }

    return promise
  }

  func onUnreadConversationsChanged(listener: @escaping (Double) -> Void) throws {
    // Android-only: the iOS SDK has no unread-conversations observer, only the
    // one-shot getters above. Documented on the spec; intentionally inert here.
  }

  // MARK: - User properties

  func setUserProperties(properties: CarrotQuestUserProperties) throws {
    let userProperties = Self.makeUserProperties(from: properties)

    guard !userProperties.isEmpty else { return }

    Carrot.shared.setUserProperty(userProperties)
  }

  func setProperties(properties: [CarrotQuestProperty]) throws {
    let userProperties = properties.compactMap(Self.makeProperty)

    guard !userProperties.isEmpty else { return }

    Carrot.shared.setUserProperty(userProperties)
  }

  /// Map the ergonomic struct onto Carrot's property types.
  ///
  /// Empty values are dropped rather than written as blank strings, and a
  /// `custom` key that collides with a system property is ignored so the typed
  /// field always wins.
  private static func makeUserProperties(
    from properties: CarrotQuestUserProperties
  ) -> [UserProperty] {
    var result: [UserProperty] = []

    let systemProperties: [(name: String, key: CarrotUserProperty.Property, value: String?)] = [
      ("name", .name, properties.name),
      ("phone", .phone, properties.phone),
      ("email", .email, properties.email),
    ]

    let reservedKeys = Set(systemProperties.map { $0.name })

    for property in systemProperties {
      guard let value = property.value, !value.isEmpty else { continue }

      result.append(CarrotUserProperty(key: property.key, value: value))
    }

    if let custom = properties.custom {
      for (key, value) in custom {
        guard !key.isEmpty, !value.isEmpty else { continue }
        guard !reservedKeys.contains(key) else { continue }

        result.append(UserProperty(key: key, value: value))
      }
    }

    return result
  }

  private static func makeProperty(_ property: CarrotQuestProperty) -> UserProperty? {
    guard !property.key.isEmpty, !property.value.isEmpty else { return nil }

    // Nitro lower-cases enum cases when generating them, so this is
    // `.updateorcreate`, not `.updateOrCreate`.
    let operation = nativeOperation(property.operation ?? .updateorcreate)

    switch property.kind ?? .custom {
    case .system:
      guard let key = systemKey(property.key) else {
        // Unknown system key — fall back to a free-form property rather than
        // silently dropping the value.
        return UserProperty(key: property.key, value: property.value, operation: operation)
      }
      return CarrotUserProperty(key: key, value: property.value, operation: operation)

    case .ecommerce:
      guard let key = ecommerceKey(property.key) else {
        return UserProperty(key: property.key, value: property.value, operation: operation)
      }
      return EcommerceUserProperty(key: key, value: property.value, operation: operation)

    case .custom:
      return UserProperty(key: property.key, value: property.value, operation: operation)
    }
  }

  /// Map JS key names onto the SDK's enums explicitly.
  ///
  /// Deliberately not `Property(rawValue:)` — the enums' wire values are not
  /// part of the published interface and need not match the case names, so
  /// round-tripping through `rawValue` would be guessing.
  private static func systemKey(_ key: String) -> CarrotUserProperty.Property? {
    switch key {
    case "name": return .name
    case "phone": return .phone
    case "email": return .email
    case "pushNotificationsSubscribe": return .pushNotificationsSubscribe
    case "pushCampaignsSubscribe": return .pushCampaignsSubscribe
    case "lastUtmSource": return .lastUtmSource
    case "lastUtmMedium": return .lastUtmMedium
    case "lastUtmCampaign": return .lastUtmCampaign
    case "lastUtmTerm": return .lastUtmTerm
    case "lastUtmContent": return .lastUtmContent
    default: return nil
    }
  }

  private static func ecommerceKey(_ key: String) -> EcommerceUserProperty.Property? {
    switch key {
    case "cartAmount": return .cartAmount
    case "viewedProducts": return .viewedProducts
    case "cartItems": return .cartItems
    case "lastOrderStatus": return .lastOrderStatus
    case "lastPayment": return .lastPayment
    case "revenue": return .revenue
    case "profit": return .profit
    case "group": return .group
    case "discount": return .discount
    case "ordersCount": return .ordersCount
    case "orderedItems": return .orderedItems
    case "orderedCategories": return .orderedCategories
    case "viewedCategories": return .viewedCategories
    default: return nil
    }
  }

  private static func nativeOperation(
    _ operation: CarrotQuestPropertyOperation
  ) -> UserProperty.Operations {
    switch operation {
    case .updateorcreate: return .updateOrCreate
    case .setonce: return .setOnce
    case .add: return .add
    case .delete: return .delete
    case .append: return .append
    case .union: return .union
    case .exclude: return .exclude
    }
  }

  // MARK: - Tracking

  func trackEvent(name: String, params: [String: CarrotQuestEventValue]?) throws {
    guard !name.isEmpty else { return }

    guard let params = params, !params.isEmpty else {
      Carrot.shared.trackEvent(withName: name, withParams: "")
      return
    }

    Carrot.shared.trackEvent(
      withName: name,
      withParamsDict: params.mapValues(Self.unwrap)
    )
  }

  /// Unwrap the JS variant into the untyped value the SDK's params dictionary
  /// expects, keeping the original JSON type.
  private static func unwrap(_ value: CarrotQuestEventValue) -> Any {
    switch value {
    case .first(let bool): return bool
    case .second(let string): return string
    case .third(let number):
      // JS has a single number type, so whole numbers arrive as Doubles.
      // Send them as integers so `1` does not become `1.0` on the wire.
      if number.isFinite, number == number.rounded(),
         number >= Double(Int.min), number <= Double(Int.max) {
        return Int(number)
      }
      return number
    }
  }

  func trackScreen(name: String) throws {
    guard !name.isEmpty else { return }

    Carrot.shared.trackScreen(name)
  }

  func trackUtm(url: String) throws {
    guard let parsed = URL(string: url) else { return }

    Carrot.shared.trackUtm(parsed)
  }

  // MARK: - Push notifications

  func setPushToken(token: String) throws {
    CarrotNotificationService.shared.setToken(token)
  }

  func deletePushToken() throws {
    CarrotNotificationService.shared.deleteToken()
  }

  func pushNotificationsUnsubscribe() throws -> Promise<Void> {
    CarrotNotificationService.shared.pushNotificationsUnsubscribe()
    return Promise.resolved(withResult: ())
  }

  func pushCampaignsUnsubscribe() throws -> Promise<Void> {
    CarrotNotificationService.shared.pushCampaignsUnsubscribe()
    return Promise.resolved(withResult: ())
  }

  func isCarrotPush(payloadJson: String) throws -> Bool {
    guard let userInfo = Self.decodePayload(payloadJson) else { return false }

    return CarrotNotificationService.shared.canHandle(userInfo)
  }

  func isAutoMessage(payloadJson: String) throws -> Bool {
    // The iOS SDK exposes no auto-message predicate; Android does. Carrot's
    // own payloads carry the discriminator, so read it directly rather than
    // reporting a value we cannot determine.
    guard let userInfo = Self.decodePayload(payloadJson) else { return false }

    if let type = userInfo["type"] as? String {
      return type == "auto_message"
    }

    return false
  }

  func handlePushNotification(payloadJson: String) throws {
    guard let userInfo = Self.decodePayload(payloadJson) else {
      throw CarrotQuestError.invalidPayload
    }

    CarrotNotificationService.shared.show(from: userInfo, appGroudDomain: appGroup)
  }

  func handlePushClick(payloadJson: String, openLink: Bool) throws {
    guard let userInfo = Self.decodePayload(payloadJson) else {
      throw CarrotQuestError.invalidPayload
    }

    CarrotNotificationService.shared.clickNotification(
      userInfo: userInfo,
      appGroudDomain: appGroup,
      openLink: openLink
    )
  }

  func getPushLink(payloadJson: String) throws -> String? {
    // The typed accessor takes a UNNotificationResponse, which JS cannot hold.
    // Carrot's payloads carry the link under a stable key, so read it from the
    // decoded dictionary instead.
    guard let userInfo = Self.decodePayload(payloadJson) else { return nil }

    for key in ["carrot_link", "link", "url"] {
      if let value = userInfo[key] as? String, !value.isEmpty {
        return value
      }
    }

    return nil
  }

  func wasPushShownEarlier(payloadJson: String) throws -> Promise<Bool> {
    let promise = Promise<Bool>()

    guard let userInfo = Self.decodePayload(payloadJson) else {
      promise.reject(withError: CarrotQuestError.invalidPayload)
      return promise
    }

    CarrotNotificationService.shared.isShownEarlier(
      userInfo: userInfo,
      appGroudDomain: appGroup
    ) { shown in
      promise.resolve(withResult: shown)
    }

    return promise
  }

  /// App Group recorded at setup, needed by the notification helpers to reach
  /// the shared store written by the service extension.
  private var appGroup: String? {
    return CarrotQuestSetup.appGroup
  }

  private static func decodePayload(_ json: String) -> [String: Any]? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data),
      let dictionary = object as? [String: Any]
    else {
      return nil
    }

    return dictionary
  }

  // MARK: - Deep links

  func onUrlOpen(source: CarrotQuestUrlSource, listener: @escaping (String) -> Void) throws {
    CustomUrlOpener.shared.set(for: Self.nativeUrlType(source)) { url in
      listener(url.absoluteString)
    }
  }

  private static func nativeUrlType(_ source: CarrotQuestUrlSource) -> CustomUrlOpener.UrlType {
    switch source {
    case .push: return .push
    case .chat: return .chat
    case .popup: return .popup
    case .all: return .all
    }
  }

  func openBrowserLink(url: String) throws {
    guard let parsed = URL(string: url) else { return }

    DispatchQueue.main.async {
      CustomUrlOpener.shared.openBrowserLink(parsed)
    }
  }

  func openUniversalLink(url: String) throws {
    guard let parsed = URL(string: url) else { return }

    DispatchQueue.main.async {
      CustomUrlOpener.shared.openUniversalLink(parsed)
    }
  }

  // MARK: - Diagnostics

  func getDiagnostics() throws -> String? {
    // Android-only: the iOS SDK exposes no diagnostics dump.
    return nil
  }

  func onLog(listener: @escaping (CarrotQuestLogEntry) -> Void) throws {
    // Android-only: the iOS SDK has no logging hook to attach to.
    // Documented on the spec; intentionally inert here.
  }

  func offLog() throws {
    // Nothing was ever attached on iOS.
  }
}
