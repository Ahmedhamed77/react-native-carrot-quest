# Contributing

Contributions are always welcome, no matter how large or small!

We want this community to be friendly and respectful to each other. Please follow it in all your interactions with the project. Before contributing, please read the [code of conduct](./CODE_OF_CONDUCT.md).

## Development workflow

This project is a monorepo managed using [Yarn workspaces](https://yarnpkg.com/features/workspaces). It contains the following packages:

- The library package in the root directory.
- An example app in the `example/` directory.

To get started with the project, make sure you have the correct version of [Node.js](https://nodejs.org/) installed. See the [`.nvmrc`](./.nvmrc) file for the version used in this project.

Run `yarn` in the root directory to install the required dependencies for each package:

```sh
yarn
```

> Since the project relies on Yarn workspaces, you cannot use [`npm`](https://github.com/npm/cli) for development without manually migrating.

This project uses Nitro Modules. If you're not familiar with how Nitro works, make sure to check the [Nitro Modules Docs](https://nitro.margelo.com/).

You need to run [Nitrogen](https://nitro.margelo.com/docs/nitrogen) to generate the boilerplate code required for this project. The example app will not build without this step.

Run **Nitrogen** in following cases:

- When you make changes to any `*.nitro.ts` files.
- When running the project for the first time (since the generated files are not committed to the repository).

To invoke **Nitrogen**, use the following command:

```sh
yarn nitrogen
```

The [example app](/example/) demonstrates usage of the library. You need to run it to test any changes you make.

It is configured to use the local version of the library, so any changes you make to the library's source code will be reflected in the example app. Changes to the library's JavaScript code will be reflected in the example app without a rebuild, but native code changes will require a rebuild of the example app.

If you want to use Android Studio or Xcode to edit the native code, you can open the `example/android` or `example/ios` directories respectively in those editors. To edit the Objective-C or Swift files, open `example/ios/CarrotQuestExample.xcworkspace` in Xcode and find the source files at `Pods > Development Pods > react-native-carrot-quest`.

To edit the Java or Kotlin files, open `example/android` in Android studio and find the source files at `react-native-carrot-quest` under `Android`.

You can use various commands from the root directory to work with the project.

To start the packager:

```sh
yarn example start
```

To run the example app on Android:

```sh
yarn example android
```

To run the example app on iOS:

```sh
yarn example ios
```

To confirm that the app is running with the new architecture, you can check the Metro logs for a message like this:

```sh
Running "CarrotQuestExample" with {"fabric":true,"initialProps":{"concurrentRoot":true},"rootTag":1}
```

Note the `"fabric":true` and `"concurrentRoot":true` properties.

Make sure your code passes TypeScript:

```sh
yarn typecheck
```

To check for linting errors, run the following:

```sh
yarn lint
```

To fix formatting errors, run the following:

```sh
yarn lint --fix
```



### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
enforced by [commitlint](https://commitlint.js.org/) through a
[lefthook](https://github.com/evilmartians/lefthook) `commit-msg` hook. The
changelog and the version bump are generated from them:

- `fix: ...` — patch
- `feat: ...` — minor
- `feat!: ...` or a `BREAKING CHANGE:` footer — major
- `chore:`, `docs:`, `test:`, `ci:`, `refactor:` — no release notes

Bumping a native SDK pin is user-visible (it changes what apps resolve), so use
`feat:` or `fix:` and mention the new versions in the subject.

### Publishing to npm

Releases are cut locally and published by CI. You never run `npm publish`.

1. Check out `main`, up to date, with a clean working tree and CI green.
2. Run `yarn verify:native` (online) so both native pins are re-checked.
3. Run:

   ```sh
   yarn release
   ```

   [release-it](https://github.com/release-it/release-it) suggests the next
   version from the commits, updates `CHANGELOG.md`, commits
   `chore: release <version>`, tags `v<version>` and pushes both.
4. The `v*` tag triggers [`release.yml`](.github/workflows/release.yml), which
   re-runs lint, typecheck, tests and the Android SDK check, builds the package,
   publishes it to npm with provenance and creates the GitHub Release from the
   changelog.

To preview a release without changing anything: `yarn release --dry-run`.

**One-time setup (maintainer).** Publishing uses npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) rather than a
token. On npmjs.com open the package → Settings → Trusted Publisher and add a
GitHub Actions publisher: owner `Ahmedhamed77`, repository
`react-native-carrot-quest`, workflow `release.yml`.

### Scripts

The `package.json` file contains various scripts for common tasks:

- `yarn`: setup project by installing dependencies.
- `yarn typecheck`: type-check files with TypeScript.
  - `yarn lint`: lint files with [ESLint](https://eslint.org/).
    - `yarn example start`: start the Metro server for the example app.
- `yarn example android`: run the example app on Android.
- `yarn example ios`: run the example app on iOS.
- `yarn test`: run the unit tests.
- `yarn verify:native`: check the bridge against the pinned native SDKs.
- `yarn release`: bump the version, update the changelog, tag and push (see above).

### Verifying the native SDK surface

Carrot does not officially support React Native, so this package tracks the
vendor SDKs itself. Two checks guard against drift:

```bash
yarn test            # offline: fails if a version pin moved without re-verification
yarn verify:native   # online: checks every native symbol against the real artifacts
```

`verify:native` downloads the pinned Android AAR, parses its API class, and
reads the `.swiftinterface` from the pod installed under `example/ios/Pods`
(run `yarn example ios` or `pod install` there first). It compares both against
`scripts/native-api.json`.

Pass `--strict` — implied when `CI=true` — to make a skipped platform a failure
instead of a pass. Use it anywhere the result gates a merge, so a missing
prerequisite can never read as green.

**After bumping an SDK version**, run `yarn verify:native`; on success it
updates `verifiedVersion` in `scripts/native-api.json` for you. **After adding a
native call**, add its symbol to that file so the check covers it too.

The Android side needs `python3` and `unzip`. The class parser is
`scripts/lib/classdump.py` — note `.gitignore` has a blanket `lib/` rule with an
explicit negation for this directory; keep that negation if you edit it.

### Sending a pull request

> **Working on your first pull request?** You can learn how from this _free_ series: [How to Contribute to an Open Source Project on GitHub](https://app.egghead.io/playlists/how-to-contribute-to-an-open-source-project-on-github).

When you're sending a pull request:

- Prefer small pull requests focused on one change.
- Verify that linters and tests are passing.
- Review the documentation to make sure it looks good.
- Follow the pull request template when opening a pull request.
- For pull requests that change the API or implementation, discuss with maintainers first by opening an issue.
