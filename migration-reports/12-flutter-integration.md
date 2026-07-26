# Step 12 Flutter Integration

## Summary

The Flutter app was wired to the new API through rollback-safe environment
configuration. The integration is configuration-first: the shared endpoint
builders already route through `ApiConfig`, so no feature client rewrites were
required.

## Files Changed In Flutter

- `D:\wpa\furtail\furtail_app\.env.example`
- `D:\wpa\furtail\furtail_app\docs\api-cutover.md`
- `D:\wpa\furtail\furtail_app\env\new-api-emulator.json`
- `D:\wpa\furtail\furtail_app\env\rollback-7200.json`
- `D:\wpa\furtail\furtail_app\lib\core\config\app_config.dart`
- `D:\wpa\furtail\furtail_app\lib\core\network\api_config.dart`
- `D:\wpa\furtail\furtail_app\lib\main.dart`
- `D:\wpa\furtail\furtail_app\test\core\config\cutover_new_api_test.dart`
- `D:\wpa\furtail\furtail_app\test\core\config\cutover_rollback_test.dart`

## Configuration

- `FURTAIL_API_BASE_URL` is now the preferred API host define.
- `FURTAIL_SOCKET_URL` is now the preferred socket define.
- `FURTAIL_MEDIA_BASE_URL` is supported for media URLs.
- Legacy `API_BASE_URL`, `API_HOST`, `SOCKET_URL`, and `MEDIA_BASE_URL`
  remain supported for rollback-safe compatibility.

## Development Modes

### New API on port 7300

- Android emulator: `flutter run --dart-define-from-file=env/new-api-emulator.json`
- Physical device: pass `FURTAIL_API_BASE_URL`, `FURTAIL_SOCKET_URL`, and
  `FURTAIL_MEDIA_BASE_URL` directly with your LAN host on port `7300`.

### Rollback to port 7200

- Android emulator: `flutter run --dart-define-from-file=env/rollback-7200.json`
- Physical device: point the same `FURTAIL_*` variables back to port `7200`.

## Socket Configuration

No active Flutter socket client was found, so socket handling remains a config
surface only. The new `FURTAIL_SOCKET_URL` define is in place for future or
existing consumers without forcing an unnecessary runtime rewrite.

## Validation

Commands executed:

- `dart format --output=none --set-exit-if-changed lib\\core\\config\\app_config.dart lib\\core\\network\\api_config.dart lib\\main.dart test\\core\\config\\cutover_new_api_test.dart test\\core\\config\\cutover_rollback_test.dart test\\core\\auth\\auth_config_test.dart test\\core\\network\\api_config_fundraising_test.dart`
- `dart format lib\\core\\network\\api_config.dart lib\\main.dart test\\core\\config\\cutover_new_api_test.dart`
- `flutter analyze`
- `flutter analyze lib\\core\\config\\app_config.dart lib\\core\\network\\api_config.dart lib\\main.dart test\\core\\config\\cutover_new_api_test.dart test\\core\\config\\cutover_rollback_test.dart`
- `flutter test --dart-define-from-file=env\\new-api-emulator.json test\\core\\config\\cutover_new_api_test.dart test\\core\\auth\\auth_config_test.dart test\\core\\network\\api_config_fundraising_test.dart`
- `flutter test --dart-define-from-file=env\\rollback-7200.json test\\core\\config\\cutover_rollback_test.dart`
- `npm run check` in `D:\wpa\furtail\furtail_app_api`

## Results

- `dart format` passed after applying the formatter output.
- Targeted `flutter analyze` on the changed files passed.
- Full `flutter analyze` reported 193 existing repository issues unrelated to
  this cutover.
- The new API and rollback config tests passed.
- The existing auth and endpoint-resolution tests passed under the new API
  cutover profile.
- `npm run check` in the API repo passed.

## Rollback Notes

Rollback is configuration-only:

1. Switch the emulator back to `env/rollback-7200.json`.
2. For a physical device, repoint `FURTAIL_API_BASE_URL` and
   `FURTAIL_SOCKET_URL` to port `7200`.
3. Leave media URLs unchanged unless the storage host also changes.
4. No permanent dual writes were introduced.

## Unresolved Limits

- Production was not switched to the new API.
- The repo still has existing analyzer noise outside the files changed for this
  step.
- No active socket client code needed updates because none was present.

