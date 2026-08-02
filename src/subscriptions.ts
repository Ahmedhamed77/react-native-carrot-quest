/**
 * A JS-side listener registry that multiplexes many subscribers over a single
 * native callback.
 *
 * Each SDK hook (`onVisibilityUIChanged`, `setCloseChatCallback`,
 * `setUnreadConversationsCallback`, `CustomUrlOpener.set(for:)`) is a *setter*:
 * registering twice replaces the first callback. Handing that directly to app
 * code means two components cannot both listen, and a component that remounts
 * — or is hot-reloaded — leaves a stale closure installed with no way to
 * detach it.
 *
 * So the native callback is installed exactly once per channel, and fan-out
 * happens here where a subscription can actually be removed.
 */

/** Returned by every listener registration. Call `remove()` to unsubscribe. */
export interface CarrotQuestSubscription {
  remove(): void;
}

const noopSubscription: CarrotQuestSubscription = { remove: () => {} };

export { noopSubscription };

/**
 * Creates an `add(listener)` function for one native channel.
 *
 * @param install receives the fan-out dispatcher and wires it to the native
 *   callback. Called on the first subscription, and again after a teardown.
 * @param uninstall detaches the native callback once the last listener is
 *   removed. Omit it for channels the SDK cannot detach — the dispatcher then
 *   stays installed and fans out to an empty set, which is only acceptable for
 *   low-frequency signals.
 */
export function createChannel<Args extends unknown[]>(
  install: (dispatch: (...args: Args) => void) => void,
  uninstall?: () => void
): (listener: (...args: Args) => void) => CarrotQuestSubscription {
  const listeners = new Set<(...args: Args) => void>();
  let installed = false;

  const dispatch = (...args: Args) => {
    // Copy first: a listener may unsubscribe itself (or another) while we emit.
    for (const listener of [...listeners]) {
      try {
        listener(...args);
      } catch (error) {
        // One misbehaving subscriber must not stop the others, and this call
        // originates from native code where a throw has nowhere to go.
        console.error('react-native-carrot-quest: listener threw', error);
      }
    }
  };

  return (listener) => {
    if (!installed) {
      // Install lazily so merely importing the package does not register
      // native callbacks.
      installed = true;
      install(dispatch);
    }

    listeners.add(listener);

    let removed = false;

    return {
      remove: () => {
        // Idempotent: removing twice must not disturb a re-added listener.
        if (removed) return;
        removed = true;
        listeners.delete(listener);

        // Detach once nobody is listening, so native stops pushing across the
        // bridge. The next subscription reinstalls.
        if (listeners.size === 0 && uninstall && installed) {
          installed = false;
          uninstall();
        }
      },
    };
  };
}
