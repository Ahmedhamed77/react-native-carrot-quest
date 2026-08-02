import { NitroModules } from 'react-native-nitro-modules';
import type {
  CarrotQuest,
  CarrotQuestEventValue,
  CarrotQuestLogEntry,
  CarrotQuestProperty,
  CarrotQuestSetupOptions,
  CarrotQuestTheme,
  CarrotQuestUrlSource,
  CarrotQuestUserProperties,
} from './CarrotQuest.nitro';
import type { CarrotQuestSubscription } from './subscriptions';
import { createChannel } from './subscriptions';

const native = NitroModules.createHybridObject<CarrotQuest>('CarrotQuest');

// MARK: - Lifecycle

export function isConfigured(): boolean {
  return native.isConfigured;
}

export function setup(
  apiKey: string,
  options?: CarrotQuestSetupOptions
): Promise<void> {
  return native.setup(apiKey, options);
}

export function getSdkVersion(): string {
  return native.getSdkVersion();
}

// MARK: - Authentication

export function auth(
  userId: string,
  userAuthKey: string
): Promise<string | undefined> {
  return native.auth(userId, userAuthKey);
}

export function hashedAuth(
  userId: string,
  hash: string
): Promise<string | undefined> {
  return native.hashedAuth(userId, hash);
}

export function logout(): Promise<void> {
  return native.logout();
}

// MARK: - Chat UI

export function openChat(): Promise<void> {
  return native.openChat();
}

export function closeChat(): Promise<void> {
  return native.closeChat();
}

export function isChatOpen(): boolean {
  return native.isChatOpen;
}

const chatVisibilityChannel = createChannel<[boolean]>((dispatch) =>
  native.onChatVisibilityChanged(dispatch)
);

export function onChatVisibilityChanged(
  listener: (visible: boolean) => void
): CarrotQuestSubscription {
  return chatVisibilityChannel(listener);
}

export function setTheme(theme: CarrotQuestTheme): void {
  native.setTheme(theme);
}

// MARK: - Unread state

export function getUnreadConversationsCount(): Promise<number> {
  return native.getUnreadConversationsCount();
}

export function getUnreadMessagesCount(): Promise<number | undefined> {
  return native.getUnreadMessagesCount();
}

const unreadConversationsChannel = createChannel<[number]>((dispatch) =>
  native.onUnreadConversationsChanged(dispatch)
);

export function onUnreadConversationsChanged(
  listener: (count: number) => void
): CarrotQuestSubscription {
  return unreadConversationsChannel(listener);
}

// MARK: - User properties

export function setUserProperties(properties: CarrotQuestUserProperties): void {
  native.setUserProperties(properties);
}

export function setProperties(properties: CarrotQuestProperty[]): void {
  native.setProperties(properties);
}

// MARK: - Tracking

export function trackEvent(
  name: string,
  params?: Record<string, CarrotQuestEventValue>
): void {
  native.trackEvent(name, params);
}

export function trackScreen(name: string): void {
  native.trackScreen(name);
}

export function trackUtm(url: string): void {
  native.trackUtm(url);
}

// MARK: - Push notifications

export function setPushToken(token: string): void {
  native.setPushToken(token);
}

export function deletePushToken(): void {
  native.deletePushToken();
}

export function pushNotificationsUnsubscribe(): Promise<void> {
  return native.pushNotificationsUnsubscribe();
}

export function pushCampaignsUnsubscribe(): Promise<void> {
  return native.pushCampaignsUnsubscribe();
}

/**
 * Accepts either a decoded payload object or the raw JSON string the native
 * side expects.
 */
const encodePayload = (payload: Record<string, unknown> | string): string =>
  typeof payload === 'string' ? payload : JSON.stringify(payload);

export function isCarrotPush(
  payload: Record<string, unknown> | string
): boolean {
  return native.isCarrotPush(encodePayload(payload));
}

export function isAutoMessage(
  payload: Record<string, unknown> | string
): boolean {
  return native.isAutoMessage(encodePayload(payload));
}

export function handlePushNotification(
  payload: Record<string, unknown> | string
): void {
  native.handlePushNotification(encodePayload(payload));
}

export function handlePushClick(
  payload: Record<string, unknown> | string,
  openLink = true
): void {
  native.handlePushClick(encodePayload(payload), openLink);
}

export function getPushLink(
  payload: Record<string, unknown> | string
): string | undefined {
  return native.getPushLink(encodePayload(payload));
}

export function wasPushShownEarlier(
  payload: Record<string, unknown> | string
): Promise<boolean> {
  return native.wasPushShownEarlier(encodePayload(payload));
}

// MARK: - Deep links

// The SDK registers a handler per url type, so each source gets its own
// channel rather than sharing one.
const urlChannels = new Map<
  CarrotQuestUrlSource,
  (listener: (url: string) => void) => CarrotQuestSubscription
>();

export function onUrlOpen(
  source: CarrotQuestUrlSource,
  listener: (url: string) => void
): CarrotQuestSubscription {
  let channel = urlChannels.get(source);

  if (!channel) {
    channel = createChannel<[string]>((dispatch) =>
      native.onUrlOpen(source, dispatch)
    );
    urlChannels.set(source, channel);
  }

  return channel(listener);
}

export function openBrowserLink(url: string): void {
  native.openBrowserLink(url);
}

export function openUniversalLink(url: string): void {
  native.openUniversalLink(url);
}

// MARK: - Diagnostics

export function getDiagnostics(): string | undefined {
  return native.getDiagnostics();
}

// The only channel with a native detach — and the only one whose volume makes
// it matter, since a verbose log level pushes an entry per network call.
const logChannel = createChannel<[CarrotQuestLogEntry]>(
  (dispatch) => native.onLog(dispatch),
  () => native.offLog()
);

export function onLog(
  listener: (entry: CarrotQuestLogEntry) => void
): CarrotQuestSubscription {
  return logChannel(listener);
}
