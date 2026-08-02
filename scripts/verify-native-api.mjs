#!/usr/bin/env node
/**
 * Verify that the pinned Carrot SDKs still expose every symbol this bridge calls.
 *
 * Android: downloads the pinned AAR and parses the obfuscated API class.
 * iOS: reads the `.swiftinterface` from the example app's installed pod.
 *
 * Usage:
 *   yarn verify:native            check both platforms
 *   yarn verify:native --ios      check iOS only
 *   yarn verify:native --android  check Android only
 *   yarn verify:native --strict   treat skips as failures (use this in CI)
 *
 * Exits non-zero if a required symbol is missing. Under `--strict` (implied by
 * CI=true) a skipped platform also fails, so a missing prerequisite cannot pass
 * as a green check.
 *
 * Requires `python3` and `unzip` for the Android side.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const snapshot = JSON.parse(readFileSync(join(here, 'native-api.json'), 'utf8'));

const args = process.argv.slice(2);
const only = args.find((a) => a === '--ios' || a === '--android');
// CI must never report green because a prerequisite was missing.
const strict = args.includes('--strict') || process.env.CI === 'true';

const ANDROID_REPO =
  'https://raw.github.com/carrotquest/android-sdk/carrotquest/io/carrotquest/android-sdk';

let failed = false;

const report = (platform, missing, total) => {
  if (missing.length === 0) {
    console.log(`✓ ${platform}: all ${total} symbols present`);
    return;
  }

  failed = true;
  console.error(`✗ ${platform}: ${missing.length}/${total} symbols missing`);
  for (const symbol of missing) {
    console.error(`    ${symbol}`);
  }
};

const skip = (platform, reason) => {
  if (strict) {
    failed = true;
    console.error(`✗ ${platform}: cannot verify — ${reason}`);
    return;
  }

  console.log(`- ${platform}: skipped (${reason})`);
};

/** Fail rather than skip: the repo itself is broken, not the environment. */
const missingPrerequisite = (platform, reason) => {
  failed = true;
  console.error(`✗ ${platform}: ${reason}`);
};

function verifyAndroid() {
  const gradle = readFileSync(join(root, 'android', 'build.gradle'), 'utf8');
  const pinned = /carrotSdkVersion:\s*"([^"]+)"/.exec(gradle)?.[1];

  if (!pinned) {
    report('android', ['could not read carrotSdkVersion from build.gradle'], 1);
    return;
  }

  if (pinned !== snapshot.android.verifiedVersion) {
    console.warn(
      `! android: pin ${pinned} differs from verified ${snapshot.android.verifiedVersion}; ` +
        `checking ${pinned} and updating the snapshot on success.`
    );
  }

  // A missing helper means the checkout is incomplete — that is a failure, not
  // an environment skip. (`.gitignore`'s blanket `lib/` rule used to exclude
  // this file, which made a fresh clone report a silent green.)
  const parser = join(here, 'lib', 'classdump.py');

  if (!existsSync(parser)) {
    missingPrerequisite(
      'android',
      `missing ${parser} — it must be tracked in git for this check to work`
    );
    return;
  }

  const work = join(root, 'node_modules', '.cache', 'carrot-native-api');
  mkdirSync(work, { recursive: true });

  const aar = join(work, `android-sdk-${pinned}.aar`);
  const url = `${ANDROID_REPO}/${pinned}/android-sdk-${pinned}.aar`;

  if (!existsSync(aar)) {
    console.log(`  fetching ${url}`);
    try {
      execFileSync('curl', ['-sfL', '-o', aar, url], { stdio: 'inherit' });
    } catch {
      skip('android', `could not download ${url}`);
      return;
    }
  }

  const extracted = join(work, pinned);
  mkdirSync(extracted, { recursive: true });
  execFileSync('unzip', ['-o', '-q', aar, 'classes.jar', '-d', extracted]);

  const jar = join(extracted, 'classes.jar');

  const dump = (script, classPath) => {
    try {
      return execFileSync('python3', [script, jar, classPath], {
        encoding: 'utf8',
      });
    } catch (error) {
      return { error: error.message };
    }
  };

  const missing = [];
  let total = 0;

  // Methods and constructors, per class. The bridge reaches well beyond the
  // main entry point — event params, property constructors and the log types
  // are all part of the contract.
  for (const entry of snapshot.android.classes) {
    const output = dump(parser, entry.path);

    if (typeof output !== 'string') {
      missing.push(`${entry.path}: parse failed (${output.error})`);
      total += entry.symbols.length;
      continue;
    }

    total += entry.symbols.length;
    for (const symbol of entry.symbols) {
      if (!output.includes(symbol)) missing.push(`${entry.path} → ${symbol}`);
    }
  }

  // Generic signatures, where the type parameter is part of the contract.
  // Kotlin generics are invariant, so implementing Callback<Any?> where the
  // SDK declares Callback<Boolean> does not compile — and an erased descriptor
  // cannot see the difference.
  const genericParser = join(here, 'lib', 'generics.py');

  if (!existsSync(genericParser)) {
    missingPrerequisite('android', `missing ${genericParser}`);
    return;
  }

  for (const entry of snapshot.android.genericSymbols) {
    const output = dump(genericParser, entry.path);

    if (typeof output !== 'string') {
      missing.push(`${entry.path}: parse failed (${output.error})`);
      total += entry.symbols.length;
      continue;
    }

    total += entry.symbols.length;
    for (const symbol of entry.symbols) {
      if (!output.includes(symbol)) {
        missing.push(`${entry.path} → ${symbol}`);
      }
    }
  }

  // Enum constants are static fields, so they need the field dumper.
  const enumParser = join(here, 'lib', 'classinfo.py');

  if (!existsSync(enumParser)) {
    missingPrerequisite('android', `missing ${enumParser}`);
    return;
  }

  for (const entry of snapshot.android.enums) {
    const output = dump(enumParser, entry.path);

    if (typeof output !== 'string') {
      missing.push(`${entry.path}: parse failed (${output.error})`);
      total += entry.constants.length;
      continue;
    }

    total += entry.constants.length;
    for (const constant of entry.constants) {
      // Match the field line, not a substring of a longer constant name.
      if (!new RegExp(`^\\s*${constant} :`, 'm').test(output)) {
        missing.push(`${entry.path} → ${constant}`);
      }
    }
  }

  report('android', missing, total);

  if (missing.length === 0 && pinned !== snapshot.android.verifiedVersion) {
    snapshot.android.verifiedVersion = pinned;
    writeFileSync(
      join(here, 'native-api.json'),
      `${JSON.stringify(snapshot, null, 2)}\n`
    );
    console.log(`  updated verifiedVersion to ${pinned}`);
  }
}

function verifyIos() {
  const framework = join(
    root,
    'example',
    'ios',
    'Pods',
    'CarrotquestSDK',
    'CarrotSDK.xcframework',
    'ios-arm64',
    'CarrotSDK.framework',
    'Modules',
    'CarrotSDK.swiftmodule',
    'arm64-apple-ios.swiftinterface'
  );

  if (!existsSync(framework)) {
    skip('ios', 'run `pod install` in example/ios first');
    return;
  }

  const iface = readFileSync(framework, 'utf8');
  const missing = snapshot.ios.requiredSymbols.filter(
    (symbol) => !iface.includes(symbol)
  );

  report('ios', missing, snapshot.ios.requiredSymbols.length);
}

if (only !== '--ios') verifyAndroid();
if (only !== '--android') verifyIos();

process.exit(failed ? 1 : 0);
