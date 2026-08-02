/**
 * The listener registry multiplexes many subscribers over one native callback,
 * because every SDK hook is a setter — registering twice replaces the first.
 */
import { createChannel } from '../subscriptions';

describe('createChannel', () => {
  it('installs the native callback lazily, and only once', () => {
    const install = jest.fn();
    const add = createChannel<[number]>(install);

    expect(install).not.toHaveBeenCalled();

    add(() => {});
    add(() => {});

    expect(install).toHaveBeenCalledTimes(1);
  });

  it('fans one native call out to every subscriber', () => {
    let dispatch = (_: number) => {};
    const add = createChannel<[number]>((d) => {
      dispatch = d;
    });

    const first = jest.fn();
    const second = jest.fn();
    add(first);
    add(second);

    dispatch(3);

    expect(first).toHaveBeenCalledWith(3);
    expect(second).toHaveBeenCalledWith(3);
  });

  it('stops delivering to a removed listener but keeps the others', () => {
    let dispatch = (_: number) => {};
    const add = createChannel<[number]>((d) => {
      dispatch = d;
    });

    const stale = jest.fn();
    const live = jest.fn();
    const subscription = add(stale);
    add(live);

    subscription.remove();
    dispatch(1);

    expect(stale).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalledWith(1);
  });

  it('treats remove() as idempotent', () => {
    let dispatch = (_: number) => {};
    const add = createChannel<[number]>((d) => {
      dispatch = d;
    });

    const listener = jest.fn();
    const first = add(listener);
    first.remove();

    // Re-adding the same function must not be undone by a stale remove().
    add(listener);
    first.remove();

    dispatch(7);

    expect(listener).toHaveBeenCalledWith(7);
  });

  it('survives a listener that unsubscribes during dispatch', () => {
    let dispatch = (_: number) => {};
    const add = createChannel<[number]>((d) => {
      dispatch = d;
    });

    const other = jest.fn();
    const selfRemoving = jest.fn(() => subscription.remove());
    const subscription = add(selfRemoving);
    add(other);

    expect(() => dispatch(1)).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);

    dispatch(2);
    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(2);
  });

  it('detaches native once the last listener is removed', () => {
    const uninstall = jest.fn();
    const install = jest.fn();
    const add = createChannel<[number]>(install, uninstall);

    const first = add(() => {});
    const second = add(() => {});

    first.remove();
    expect(uninstall).not.toHaveBeenCalled();

    second.remove();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('reinstalls on the next subscription after a teardown', () => {
    const install = jest.fn();
    const uninstall = jest.fn();
    const add = createChannel<[number]>(install, uninstall);

    add(() => {}).remove();
    expect(install).toHaveBeenCalledTimes(1);

    add(() => {});
    expect(install).toHaveBeenCalledTimes(2);
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('does not detach twice when remove() is called again', () => {
    const uninstall = jest.fn();
    const add = createChannel<[number]>(() => {}, uninstall);

    const subscription = add(() => {});
    subscription.remove();
    subscription.remove();

    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('stays installed when the channel cannot be detached', () => {
    // Most SDK hooks are setters with no detach; those fan out to an empty set
    // rather than tearing down.
    const install = jest.fn();
    const add = createChannel<[number]>(install);

    add(() => {}).remove();
    add(() => {});

    expect(install).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener from the rest', () => {
    const error = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    let dispatch = (_: number) => {};
    const add = createChannel<[number]>((d) => {
      dispatch = d;
    });

    add(() => {
      throw new Error('boom');
    });
    const survivor = jest.fn();
    add(survivor);

    // This call originates from native code, where a throw has nowhere to go.
    expect(() => dispatch(1)).not.toThrow();
    expect(survivor).toHaveBeenCalledWith(1);

    error.mockRestore();
  });
});
