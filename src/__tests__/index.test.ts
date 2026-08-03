/** Public entry-point compatibility tests. */
export {};

const entry = require('../index');

describe('singleton-style default API', () => {
  it('exposes the same functions as the named exports', () => {
    expect(entry.default.setup).toBe(entry.setup);
    expect(entry.default.auth).toBe(entry.auth);
    expect(entry.default.openChat).toBe(entry.openChat);
    expect(entry.default.trackEvent).toBe(entry.trackEvent);
    expect(entry.default.onLog).toBe(entry.onLog);
  });

  it('keeps named exports available for existing consumers', () => {
    expect(typeof entry.setup).toBe('function');
    expect(typeof entry.hashedAuth).toBe('function');
    expect(typeof entry.handlePushNotification).toBe('function');
  });
});
