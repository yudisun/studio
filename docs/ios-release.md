# Studio: iPhone release preparation

Status: source project prepared; not a signed app or an App Store release. It builds on the backup-safety changes in PR #1. The current draft adds Capacitor 8.6, bundled assets, native backup sharing, the camera purpose string, a privacy manifest for filesystem timestamps, and an unsigned simulator build workflow.

## Run the app

Use Node 22+ and pnpm 11.25.0. On a Mac with Xcode 26 or later installed and its initial setup completed:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm ios:sync
pnpm ios:open
```

In Xcode, select the App target, choose a signing team, and select an iPhone or iPhone simulator. The project uses Swift Package Manager; Xcode downloads its native dependencies on the first build. The initial bundle identifier is `com.yudisun.studio`; confirm it before registering the app in App Store Connect. If it changes, update both `capacitor.config.json` and the target's Debug/Release bundle identifiers. Never change the deployed app's storage hostname/scheme without an explicit data migration.

The web source still runs by serving the repository's static assets. `dist/` is generated for the native package and contains only app assets, not backups or test fixtures. Run `pnpm ios:sync` after every source change. Keep the generated Xcode project in source control; do not delete and regenerate it, which would discard its purpose string and privacy manifest.

The GitHub iPhone build workflow runs the JavaScript tests and compiles an unsigned simulator app. It does not sign, upload, or release the app, and a successful build does not prove the device interactions work.

## Move an existing collection from the website

Safari/home-screen storage and the installed iPhone app have separate collections. There is no automatic migration or cloud sync.

1. In the existing web app, open Backup and export the collection to Files.
2. Keep that backup file and the existing app until migration is verified.
3. Open the iPhone app, select Backup → Choose backup file, and restore it.
4. Compare piece, material, clay, inspiration, and glaze-mark counts. Open several photos and inspect their ordered glaze layers.
5. Export from the iPhone app and restore that file into a separate test installation to verify a complete round trip.

On iPhone, Export opens the system share sheet. Choose Save to Files and a destination. Cancelling the share sheet is not a saved backup. Temporary export files live in the app's cache and are removed when the share sheet finishes; the selected destination keeps its own copy. If the app is killed during export, iOS may retain the temporary cache file until it reclaims the cache. Treat backups as personal files because they include photos and notes.

## Required device checks before TestFlight release

Use synthetic/sample records first, then a copy of a real collection. Record the iPhone model, iOS version, and app build for each run. The project currently targets iPhone with iOS 15+. Verify the oldest supported system or raise that target to the oldest version actually tested.

- Cold launch in airplane mode after a fresh install. All four collection tabs and Backup must work; relaunch offline and confirm saved records and photos remain.
- Choose JPEG and HEIC photos from Photos and Files. Add multiple images, cancel the picker, deny camera permission, then recover and try again. Test Take Photo on a physical iPhone.
- Add a piece and mark two glaze layers in order. Pinch/zoom, edit the mark, reorder and remove photos, force-close, and reopen. Confirm pin positions and application order remain correct.
- Export with Save to Files, cancel export, and restore a complete v1 backup. Reject a damaged backup without changing the collection. Test a realistic large photo collection and a device low on storage.
- Update the installed app without uninstalling it and confirm its collection survives. Uninstalling can remove on-device data; keep a separate exported backup.
- Check the keyboard, notch/home-indicator safe areas, portrait/landscape, larger text, and VoiceOver. The existing zoom restriction and unlabeled icon controls still need an accessibility pass.

## Before submitting to Apple

- Compile and test a signed Release build. Set the signing team, confirm the bundle identifier, and create the App Store Connect record under the correct Apple Developer membership.
- Replace the generated Capacitor icon and splash placeholders with approved Studio artwork. The existing web icons are 180/512 px; prepare a proper 1024 px App Store icon and capture screenshots from the actual app.
- Publish a privacy policy and support page with the owner's chosen contact details, and make the privacy policy accessible inside the app. These URLs and final text are not supplied by this change.
- Complete App Privacy and the age-rating questionnaire for the final binary. This code has no account, analytics, advertising, or developer server upload. Photos and notes stay on-device unless the user exports them. Recheck all final dependencies and Xcode's privacy report; the bundled privacy manifest is not a substitute for a privacy policy or App Store disclosures.
- Review third-party license/notice requirements for the vendored HEIC decoder and native dependencies before distributing the binary.
- Prepare the app description, keywords, category, pricing, screenshots, support contact, and review notes. Explain photo-first pieces, ordered glaze annotations, material/clay libraries, inspiration, and offline use. Do not claim automatic iCloud sync.
- Run TestFlight on a physical iPhone, resolve the device issues above, then submit for review. This project alone does not establish App Store approval.

Google Play comes after the iPhone release. The web interface and native share adapter can be reused, but Android packaging, device testing, signing, target SDK, and Play listing/data disclosures are still separate work.

## Official references

Checked November 1, 2026:

- [Apple's current submission requirements](https://developer.apple.com/news/upcoming-requirements/): Xcode 26+ with the iOS 26 SDK or later is currently required for uploads.
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): app completeness, functionality, and privacy-policy requirements.
- [Capacitor iOS setup](https://capacitorjs.com/docs/ios) and [Swift Package Manager](https://capacitorjs.com/docs/ios/spm).
- [Filesystem privacy manifest requirements](https://capacitorjs.com/docs/apis/filesystem): timestamp reason C617.1 applies to files in the app container.
- [Native share sheet API](https://capacitorjs.com/docs/apis/share).
