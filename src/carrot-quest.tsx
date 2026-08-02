import type {
  CarrotQuestEventValue,
  CarrotQuestLogEntry,
  CarrotQuestProperty,
  CarrotQuestSetupOptions,
  CarrotQuestTheme,
  CarrotQuestUrlSource,
  CarrotQuestUserProperties,
} from './CarrotQuest.nitro';
import type { CarrotQuestSubscription } from './subscriptions';
import { noopSubscription } from './subscriptions';

const unsupported = (method: string): never => {
  throw new Error(
    `react-native-carrot-quest: ${method}() is only supported on iOS and Android.`
  );
};

// MARK: - Lifecycle

export function isConfigured(): boolean {
  return false;
}

export function setup(
  _apiKey: string,
  _options?: CarrotQuestSetupOptions
): Promise<void> {
  return unsupported('setup');
}

export function getSdkVersion(): string {
  return unsupported('getSdkVersion');
}

// MARK: - Authentication

export function auth(
  _userId: string,
  _userAuthKey: string
): Promise<string | undefined> {
  return unsupported('auth');
}

export function hashedAuth(
  _userId: string,
  _hash: string
): Promise<string | undefined> {
  return unsupported('hashedAuth');
}

export function logout(): Promise<void> {
  return unsupported('logout');
}

// MARK: - Chat UI

export function openChat(): Promise<void> {
  return unsupported('openChat');
}

export function closeChat(): Promise<void> {
  return unsupported('closeChat');
}

export function isChatOpen(): boolean {
  return false;
}

export function onChatVisibilityChanged(
  _listener: (visible: boolean) => void
): CarrotQuestSubscription {
  return noopSubscription;
}

export function setTheme(_theme: CarrotQuestTheme): void {
  unsupported('setTheme');
}

// MARK: - Unread state

export function getUnreadConversationsCount(): Promise<number> {
  return unsupported('getUnreadConversationsCount');
}

export function getUnreadMessagesCount(): Promise<number | undefined> {
  return unsupported('getUnreadMessagesCount');
}

export function onUnreadConversationsChanged(
  _listener: (count: number) => void
): CarrotQuestSubscription {
  return noopSubscription;
}

// MARK: - User properties

export function setUserProperties(
  _properties: CarrotQuestUserProperties
): void {
  unsupported('setUserProperties');
}

export function setProperties(_properties: CarrotQuestProperty[]): void {
  unsupported('setProperties');
}

// MARK: - Tracking

export function trackEvent(
  _name: string,
  _params?: Record<string, CarrotQuestEventValue>
): void {
  unsupported('trackEvent');
}

export function trackScreen(_name: string): void {
  unsupported('trackScreen');
}

export function trackUtm(_url: string): void {
  unsupported('trackUtm');
}

// MARK: - Push notifications

export function setPushToken(_token: string): void {
  unsupported('setPushToken');
}

export function deletePushToken(): void {
  unsupported('deletePushToken');
}

export function pushNotificationsUnsubscribe(): Promise<void> {
  return unsupported('pushNotificationsUnsubscribe');
}

export function pushCampaignsUnsubscribe(): Promise<void> {
  return unsupported('pushCampaignsUnsubscribe');
}

export function isCarrotPush(
  _payload: Record<string, unknown> | string
): boolean {
  return false;
}

export function isAutoMessage(
  _payload: Record<string, unknown> | string
): boolean {
  return false;
}

export function handlePushNotification(
  _payload: Record<string, unknown> | string
): void {
  unsupported('handlePushNotification');
}

export function handlePushClick(
  _payload: Record<string, unknown> | string,
  _openLink?: boolean
): void {
  unsupported('handlePushClick');
}

export function getPushLink(
  _payload: Record<string, unknown> | string
): string | undefined {
  return undefined;
}

export function wasPushShownEarlier(
  _payload: Record<string, unknown> | string
): Promise<boolean> {
  return Promise.resolve(false);
}

// MARK: - Deep links

export function onUrlOpen(
  _source: CarrotQuestUrlSource,
  _listener: (url: string) => void
): CarrotQuestSubscription {
  return noopSubscription;
}

export function openBrowserLink(_url: string): void {
  unsupported('openBrowserLink');
}

export function openUniversalLink(_url: string): void {
  unsupported('openUniversalLink');
}

// MARK: - Diagnostics

export function getDiagnostics(): string | undefined {
  return undefined;
}

export function onLog(
  _listener: (entry: CarrotQuestLogEntry) => void
): CarrotQuestSubscription {
  return noopSubscription;
}
