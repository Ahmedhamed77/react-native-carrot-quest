/**
 * Offline guard against silent native SDK drift.
 *
 * The bridge is written against a specific Carrot SDK version on each platform.
 * Bumping a pin without re-verifying is exactly how the 2.x/3.x breakage got
 * missed the first time — `setDebug`, the callback-free `setup` and the
 * JSON-string `trackEvent` all vanished between 2.1.2 and 3.1.0.
 *
 * This test only checks that the pinned versions still match the versions the
 * symbol list was verified against. Actually checking the symbols requires the
 * artifacts, so that lives in `yarn verify:native`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');

const snapshot = JSON.parse(
  readFileSync(join(root, 'scripts', 'native-api.json'), 'utf8')
);

const gradle = readFileSync(join(root, 'android', 'build.gradle'), 'utf8');
const podspec = readFileSync(join(root, 'CarrotQuest.podspec'), 'utf8');
const androidSetup = readFileSync(
  join(
    root,
    'android',
    'src',
    'main',
    'java',
    'com',
    'margelo',
    'nitro',
    'carrotquest',
    'CarrotQuestSetup.kt'
  ),
  'utf8'
);
const iosSetup = readFileSync(
  join(root, 'ios', 'CarrotQuestSetup.swift'),
  'utf8'
);
const androidBridge = readFileSync(
  join(
    root,
    'android',
    'src',
    'main',
    'java',
    'com',
    'margelo',
    'nitro',
    'carrotquest',
    'CarrotQuest.kt'
  ),
  'utf8'
);
const iosBridge = readFileSync(join(root, 'ios', 'CarrotQuest.swift'), 'utf8');

describe('android SDK pin', () => {
  const pinned = /carrotSdkVersion:\s*"([^"]+)"/.exec(gradle)?.[1];

  it('declares a version', () => {
    expect(pinned).toBeDefined();
  });

  it('matches the verified version', () => {
    expect(pinned).toBe(snapshot.android.verifiedVersion);
  });

  it('stays on the 3.x line', () => {
    // 2.x has a callback-free setup(), setDebug() and JSON-string event params,
    // none of which this bridge uses.
    expect(pinned).toMatch(/^3\./);
  });

  it('resolves the SDK and its JitPack transitive dependencies', () => {
    expect(gradle).toContain('raw.github.com/carrotquest/android-sdk');
    // 3.1.0 pulls com.github.Redman1037:TSnackBar and com.github.chrisbanes:PhotoView.
    expect(gradle).toContain('jitpack.io');
  });
});

describe('ios SDK pin', () => {
  const constraint = /CarrotquestSDK',\s*'([^']+)'/.exec(podspec)?.[1];

  it('declares a constraint', () => {
    expect(constraint).toBeDefined();
  });

  it('matches the verified constraint', () => {
    expect(constraint).toBe(snapshot.ios.podspecConstraint);
  });

  it('admits the verified version', () => {
    // `~> 3.4` means >= 3.4, < 4.0.
    const floor = /~>\s*(\d+)\.(\d+)/.exec(constraint ?? '');
    const [floorMajor, floorMinor] = [Number(floor?.[1]), Number(floor?.[2])];
    const [major, minor] = (snapshot.ios.verifiedVersion as string)
      .split('.')
      .map(Number);

    expect(major).toBe(floorMajor);
    expect(minor).toBeGreaterThanOrEqual(floorMinor);
  });
});

describe('symbol snapshot', () => {
  const androidClasses = snapshot.android.classes as { path: string }[];

  it('covers every native call the bridge makes', () => {
    // A tripwire, not a parser: if someone adds a native call they should add
    // it here so `yarn verify:native` checks it too.
    expect(snapshot.ios.requiredSymbols.length).toBeGreaterThanOrEqual(30);
    expect(androidClasses.length).toBeGreaterThanOrEqual(9);
  });

  it('reaches past the main entry point', () => {
    // The bridge also calls EventParams, the property constructors and the
    // log types; checking only the obfuscated facade would miss all of them.
    const paths = androidClasses.map((entry) => entry.path).join(' ');

    expect(paths).toContain('EventParams$Builder');
    expect(paths).toContain('EcommerceUserProperty');
    expect(paths).toContain('SdkLogEntry');
  });

  it('pins the generic Callback types the bridge implements', () => {
    // Kotlin generics are invariant, so Callback<Boolean> vs Callback<Any?> is
    // a compile error that an erased descriptor cannot reveal.
    const generics = JSON.stringify(snapshot.android.genericSymbols);

    expect(generics).toContain('Callback<Ljava/lang/Boolean;>');
    expect(generics).toContain('Callback<Ljava/lang/String;>');
    expect(generics).toContain(
      'Callback<Ljava/util/List<Ljava/lang/String;>;>'
    );
  });

  it('records where the obfuscated Android API class lives', () => {
    expect(androidClasses[0]!.path).toMatch(/\.class$/);
  });
});

describe('single-flight setup finalization', () => {
  it('applies Android joined options before publishing Configured under the lock', () => {
    const start = androidSetup.indexOf('private fun settleSuccess(');
    const end = androidSetup.indexOf('private fun settleFailure(', start);
    const finalization = androidSetup.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(finalization).toMatch(
      /synchronized\(lock\) \{\s*applyMutableOptions\([^)]+\)\s*state = State\.Configured\(identity\)/
    );
  });

  it('queues the iOS joined theme before publishing configured and unlocking', () => {
    const start = iosSetup.indexOf('private static func settleSuccess(');
    const end = iosSetup.indexOf('private static func settleFailure(', start);
    const finalization = iosSetup.slice(start, end);
    const lock = finalization.indexOf('lock.lock()');
    const apply = finalization.indexOf('applyTheme(theme)');
    const configured = finalization.indexOf('state = .configured(identity)');
    const unlock = finalization.indexOf('lock.unlock()');

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(lock).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(lock);
    expect(configured).toBeGreaterThan(apply);
    expect(unlock).toBeGreaterThan(configured);
  });
});

describe('one setup call owns native readiness', () => {
  it('queues Android operations during setup and drains them on success or failure', () => {
    expect(androidSetup).toMatch(
      /is State\.Initializing -> \{\s*readinessWaiters\.add\(completion\)/
    );
    expect(androidSetup).toMatch(
      /state = State\.Configured\(identity\)[\s\S]*ready = readinessWaiters\.toList\(\)[\s\S]*ready\.forEach \{ it\(null\) \}/
    );
    expect(androidSetup).toMatch(
      /private fun settleFailure\(error: Throwable\)[\s\S]*ready = readinessWaiters\.toList\(\)[\s\S]*ready\.forEach \{ it\(error\) \}/
    );
  });

  it('queues iOS operations during setup and drains them on success or failure', () => {
    expect(iosSetup).toMatch(
      /case \.initializing:\s*readinessWaiters\.append\(completion\)/
    );
    expect(iosSetup).toMatch(
      /state = \.configured\(identity\)[\s\S]*let ready = readinessWaiters[\s\S]*completion\(nil\)/
    );
    expect(iosSetup).toMatch(
      /private static func settleFailure\(_ error: Error\)[\s\S]*let ready = readinessWaiters[\s\S]*completion\(error\)/
    );
  });

  it('routes the app-facing auth, chat, properties, and tracking APIs through readiness', () => {
    for (const operation of [
      'onChatVisibilityChanged',
      'setUserProperties',
      'trackEvent',
      'trackScreen',
      'setPushToken',
    ]) {
      expect(androidBridge).toContain(
        `CarrotQuestSetup.runWhenConfigured("${operation}")`
      );
      expect(iosBridge).toContain(
        `CarrotQuestSetup.runWhenConfigured("${operation}")`
      );
    }

    expect(androidBridge).toContain('whenConfigured(promise)');
    expect(iosBridge).toContain('whenConfigured(promise)');
  });
});
