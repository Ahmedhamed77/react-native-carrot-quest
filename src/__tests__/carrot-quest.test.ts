/**
 * Tests for the JS wrapper layer.
 *
 * These cover the logic that actually lives in JS — payload encoding, argument
 * forwarding and defaults. Native behaviour is out of scope here; the pinned
 * SDK surface is guarded by `native-compat.test.ts`.
 */
export {}; // marks this file as a module so its bindings stay file-scoped

/**
 * Channels are module-level singletons that install their native callback
 * once, so capture the dispatcher when it is installed rather than reading it
 * back off a mock that `clearAllMocks` may since have reset.
 */
const mockDispatchers: { chatVisibility?: (visible: boolean) => void } = {};

const mockHybrid = {
  isConfigured: true,
  isChatOpen: false,
  setup: jest.fn(() => Promise.resolve()),
  getSdkVersion: jest.fn(() => '3.2.1'),
  auth: jest.fn(() => Promise.resolve('carrot-1')),
  hashedAuth: jest.fn(() => Promise.resolve('carrot-2')),
  logout: jest.fn(() => Promise.resolve()),
  openChat: jest.fn(() => Promise.resolve()),
  closeChat: jest.fn(() => Promise.resolve()),
  onChatVisibilityChanged: jest.fn((cb: (visible: boolean) => void) => {
    mockDispatchers.chatVisibility = cb;
  }),
  setTheme: jest.fn(),
  getUnreadConversationsCount: jest.fn(() => Promise.resolve(3)),
  getUnreadMessagesCount: jest.fn(() => Promise.resolve(7)),
  onUnreadConversationsChanged: jest.fn(),
  setUserProperties: jest.fn(),
  setProperties: jest.fn(),
  trackEvent: jest.fn(),
  trackScreen: jest.fn(),
  trackUtm: jest.fn(),
  setPushToken: jest.fn(),
  deletePushToken: jest.fn(),
  pushNotificationsUnsubscribe: jest.fn(() => Promise.resolve()),
  pushCampaignsUnsubscribe: jest.fn(() => Promise.resolve()),
  isCarrotPush: jest.fn(() => true),
  isAutoMessage: jest.fn(() => false),
  handlePushNotification: jest.fn(),
  handlePushClick: jest.fn(),
  getPushLink: jest.fn(() => 'https://example.com'),
  wasPushShownEarlier: jest.fn(() => Promise.resolve(false)),
  onUrlOpen: jest.fn(),
  openBrowserLink: jest.fn(),
  openUniversalLink: jest.fn(),
  getDiagnostics: jest.fn(() => 'diagnostics'),
  onLog: jest.fn(),
  offLog: jest.fn(),
};

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: () => mockHybrid },
}));

const carrot = require('../carrot-quest.native');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('lifecycle', () => {
  it('forwards setup options untouched', async () => {
    await carrot.setup('key', { locale: 'ru', theme: 'dark' });

    expect(mockHybrid.setup).toHaveBeenCalledWith('key', {
      locale: 'ru',
      theme: 'dark',
    });
  });

  it('reads isConfigured as a property, not a call', () => {
    expect(carrot.isConfigured()).toBe(true);
  });
});

describe('authentication', () => {
  it('keeps auth and hashedAuth distinct', async () => {
    await carrot.auth('user', 'auth-key');
    await carrot.hashedAuth('user', 'server-hash');

    expect(mockHybrid.auth).toHaveBeenCalledWith('user', 'auth-key');
    expect(mockHybrid.hashedAuth).toHaveBeenCalledWith('user', 'server-hash');
    expect(mockHybrid.auth).toHaveBeenCalledTimes(1);
    expect(mockHybrid.hashedAuth).toHaveBeenCalledTimes(1);
  });
});

describe('push payload encoding', () => {
  const payload = { carrot_link: 'https://example.com', type: 'auto_message' };
  const encoded = JSON.stringify(payload);

  it.each([
    [
      'isCarrotPush',
      () => carrot.isCarrotPush(payload),
      () => mockHybrid.isCarrotPush,
    ],
    [
      'isAutoMessage',
      () => carrot.isAutoMessage(payload),
      () => mockHybrid.isAutoMessage,
    ],
    [
      'handlePushNotification',
      () => carrot.handlePushNotification(payload),
      () => mockHybrid.handlePushNotification,
    ],
    [
      'getPushLink',
      () => carrot.getPushLink(payload),
      () => mockHybrid.getPushLink,
    ],
    [
      'wasPushShownEarlier',
      () => carrot.wasPushShownEarlier(payload),
      () => mockHybrid.wasPushShownEarlier,
    ],
  ])('%s encodes an object payload as JSON', (_name, call, mock) => {
    call();

    expect(mock()).toHaveBeenCalledWith(encoded);
  });

  it('passes a string payload through unchanged', () => {
    carrot.isCarrotPush(encoded);

    expect(mockHybrid.isCarrotPush).toHaveBeenCalledWith(encoded);
  });

  it('defaults handlePushClick to letting the SDK open the link', () => {
    carrot.handlePushClick(payload);

    expect(mockHybrid.handlePushClick).toHaveBeenCalledWith(encoded, true);
  });

  it('honours an explicit openLink of false', () => {
    carrot.handlePushClick(payload, false);

    expect(mockHybrid.handlePushClick).toHaveBeenCalledWith(encoded, false);
  });
});

describe('tracking', () => {
  it('omits params when none are given', () => {
    carrot.trackEvent('opened');

    expect(mockHybrid.trackEvent).toHaveBeenCalledWith('opened', undefined);
  });

  it('forwards params with their JSON types intact', () => {
    // Numbers and booleans must not be stringified — Android dispatches to the
    // matching EventParams.Builder.put overload.
    carrot.trackEvent('purchased', { sku: 'abc', total: 42, gift: true });

    expect(mockHybrid.trackEvent).toHaveBeenCalledWith('purchased', {
      sku: 'abc',
      total: 42,
      gift: true,
    });
  });
});

describe('listeners', () => {
  it('registers one native handler per url source', () => {
    carrot.onUrlOpen('push', jest.fn());
    carrot.onUrlOpen('push', jest.fn());
    carrot.onUrlOpen('chat', jest.fn());

    const sources = mockHybrid.onUrlOpen.mock.calls.map(([source]) => source);
    expect(sources).toEqual(['push', 'chat']);
  });

  it('returns a subscription that detaches the listener', () => {
    const listener = jest.fn();
    const subscription = carrot.onChatVisibilityChanged(listener);

    // The registry hands native a dispatcher, not the listener itself.
    const dispatch = mockDispatchers.chatVisibility!;
    expect(dispatch).toBeDefined();

    dispatch(true);
    expect(listener).toHaveBeenCalledWith(true);

    subscription.remove();
    dispatch(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('detaches the native log sink when the last subscriber leaves', () => {
    // Verbose logging pushes an entry per network call, so an orphaned sink is
    // real bridge traffic, not just a dangling reference.
    const first = carrot.onLog(jest.fn());
    const second = carrot.onLog(jest.fn());

    first.remove();
    expect(mockHybrid.offLog).not.toHaveBeenCalled();

    second.remove();
    expect(mockHybrid.offLog).toHaveBeenCalledTimes(1);
  });

  it('does not re-register native on a second subscribe', () => {
    carrot.onUnreadConversationsChanged(jest.fn());
    carrot.onUnreadConversationsChanged(jest.fn());

    expect(mockHybrid.onUnreadConversationsChanged).toHaveBeenCalledTimes(1);
  });
});

describe('web fallback', () => {
  const web = require('../carrot-quest');

  it('throws for calls that cannot be emulated', () => {
    expect(() => web.setup('key')).toThrow(/only supported on iOS and Android/);
    expect(() => web.openChat()).toThrow(/only supported on iOS and Android/);
  });

  it('returns inert subscriptions rather than throwing', () => {
    expect(() => web.onChatVisibilityChanged(jest.fn()).remove()).not.toThrow();
    expect(() => web.onUrlOpen('all', jest.fn()).remove()).not.toThrow();
  });

  it('answers predicates without throwing', () => {
    expect(web.isConfigured()).toBe(false);
    expect(web.isChatOpen()).toBe(false);
    expect(web.isCarrotPush({})).toBe(false);
    expect(web.getPushLink({})).toBeUndefined();
    expect(web.getDiagnostics()).toBeUndefined();
  });
});
