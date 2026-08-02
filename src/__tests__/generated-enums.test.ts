/**
 * Guard against spec values that generate invalid C++.
 *
 * Nitro turns each string-union value into a C++ `enum class` member by
 * upper-casing it. If that name collides with a preprocessor macro the
 * generated header stops compiling — and because these headers are public,
 * every consuming app breaks, not just this package.
 *
 * `DEBUG` is the one that bit us: React Native defines it in Debug builds, so
 * `DEBUG SWIFT_NAME(debug) = 4` expanded to `1 SWIFT_NAME(debug) = 4`.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const generated = join(
  __dirname,
  '..',
  '..',
  'nitrogen',
  'generated',
  'shared',
  'c++'
);

/**
 * Macros reachable from a translation unit on the platforms this package
 * supports — React Native's own defines, the Apple SDK headers and the NDK's
 * libc. Not exhaustive; extend it when a new collision appears.
 *
 * Deliberately excludes Windows-only macros such as `ERROR`, `DELETE` and
 * `INTERFACE` (wingdi.h / winnt.h). `ERROR` and `DELETE` are both in use as
 * enum values here and compile cleanly for iOS and Android; banning them would
 * cost real ergonomics — `operation: 'delete'` mirrors the SDK — for a platform
 * this package does not target.
 */
const RESERVED = [
  'DEBUG', // React Native defines this in Debug builds
  'NDEBUG', // ...and this in Release builds
  'NULL',
  'TRUE',
  'FALSE',
  'MIN', // sys/param.h on Apple platforms
  'MAX',
  'INFINITY', // math.h
  'NAN',
  'EOF', // stdio.h
  'BIG_ENDIAN', // endian.h / machine/endian.h
  'LITTLE_ENDIAN',
  'BYTE_ORDER',
];

const enumMember = /^\s{4}([A-Z_][A-Z0-9_]*)\s+SWIFT_NAME/;

describe('generated C++ enums', () => {
  const files = existsSync(generated)
    ? readdirSync(generated).filter((f) => f.endsWith('.hpp'))
    : [];

  it('has generated headers to check', () => {
    // Guards against the test silently passing when nitrogen has not run.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s uses no macro-colliding member names', (file) => {
    const source = readFileSync(join(generated, file), 'utf8');

    const offenders = source
      .split('\n')
      .map((line) => enumMember.exec(line)?.[1])
      .filter(
        (name): name is string => Boolean(name) && RESERVED.includes(name!)
      );

    expect(offenders).toEqual([]);
  });
});
