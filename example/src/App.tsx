import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import {
  auth,
  closeChat,
  getDiagnostics,
  getSdkVersion,
  getUnreadConversationsCount,
  hashedAuth,
  isConfigured,
  logout,
  onChatVisibilityChanged,
  onUrlOpen,
  openChat,
  setProperties,
  setUserProperties,
  setup,
  trackEvent,
  trackScreen,
  trackUtm,
} from 'react-native-carrot-quest';
import type { CarrotQuestSubscription } from 'react-native-carrot-quest';

// Fill these in to exercise the example app.
//
// USER_AUTH_KEY is the single User Auth Key from your Carrot settings — the
// simple, less secure flow, meant for apps without a backend. SERVER_HASH is a
// per-user hash your backend generates, which is the recommended flow. Only
// hardcode either for local testing.
const API_KEY = '';
const USER_ID = 'example-user-1';
const USER_AUTH_KEY = '';
const SERVER_HASH = '';

export default function App() {
  const [status, setStatus] = useState('idle');
  const [configured, setConfigured] = useState(false);

  const run = useCallback(
    async (label: string, action: () => unknown | Promise<unknown>) => {
      setStatus(`${label}…`);
      try {
        const result = await action();
        const suffix =
          result === undefined || result === null ? '' : ` → ${String(result)}`;
        setStatus(`${label}: ok${suffix}`);
      } catch (error) {
        setStatus(`${label}: ${(error as Error).message}`);
      } finally {
        setConfigured(isConfigured());
      }
    },
    []
  );

  useEffect(() => {
    const subscriptions: CarrotQuestSubscription[] = [];

    if (!API_KEY) {
      setStatus('set API_KEY in example/src/App.tsx to try the example');
      return;
    }

    run('setup', async () => {
      await setup(API_KEY, {
        locale: 'ru',
        theme: 'fromDevice',
        logLevel: 'debugging',
      });

      // Safe to register listeners and authenticate now — setup only resolves
      // once the SDK reports success.
      subscriptions.push(
        onChatVisibilityChanged((visible) =>
          setStatus(`chat visible: ${visible}`)
        ),
        onUrlOpen('all', (url) => setStatus(`intercepted url: ${url}`))
      );

      return getSdkVersion();
    });

    // Listeners outlive the effect otherwise, holding a stale setStatus across
    // remounts and Fast Refresh.
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [run]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.configured}>isConfigured: {String(configured)}</Text>

      <Section title="auth" />
      <Button
        title="auth (shared key, less secure)"
        onPress={() => run('auth', () => auth(USER_ID, USER_AUTH_KEY))}
      />
      <Button
        title="hashedAuth (recommended)"
        onPress={() =>
          run('hashedAuth', () => hashedAuth(USER_ID, SERVER_HASH))
        }
      />
      <Button title="logout" onPress={() => run('logout', logout)} />

      <Section title="chat" />
      <Button title="openChat" onPress={() => run('openChat', openChat)} />
      <Button title="closeChat" onPress={() => run('closeChat', closeChat)} />
      <Button
        title="unread conversations"
        onPress={() => run('unread', getUnreadConversationsCount)}
      />

      <Section title="properties" />
      <Button
        title="setUserProperties"
        onPress={() =>
          run('setUserProperties', () =>
            setUserProperties({
              name: 'Example User',
              email: 'user@example.com',
              custom: { plan: 'pro' },
            })
          )
        }
      />
      <Button
        title="setProperties (ecommerce + ops)"
        onPress={() =>
          run('setProperties', () =>
            setProperties([
              { key: 'cartAmount', value: '42', kind: 'ecommerce' },
              { key: 'visits', value: '1', operation: 'add' },
            ])
          )
        }
      />

      <Section title="tracking" />
      <Button
        title="trackEvent"
        onPress={() =>
          run('trackEvent', () =>
            trackEvent('example_tapped', {
              source: 'example-app',
              attempt: 1,
              manual: true,
            })
          )
        }
      />
      <Button
        title="trackScreen"
        onPress={() => run('trackScreen', () => trackScreen('ExampleScreen'))}
      />
      <Button
        title="trackUtm"
        onPress={() =>
          run('trackUtm', () =>
            trackUtm('https://example.com/?utm_source=example')
          )
        }
      />

      <Section title="diagnostics" />
      <Button
        title="getDiagnostics (Android)"
        onPress={() =>
          run('getDiagnostics', () => getDiagnostics() ?? 'iOS: n/a')
        }
      />
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return <Text style={styles.section}>{title}</Text>;
}

function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  status: {
    textAlign: 'center',
    fontSize: 16,
  },
  configured: {
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.6,
  },
  section: {
    marginTop: 12,
    fontWeight: '700',
    opacity: 0.5,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#f4511e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});
