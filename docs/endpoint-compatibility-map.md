# Endpoint Compatibility Map

This map records the confirmed Flutter contracts that matter for Step 11 and whether the current API already satisfies them without additional compatibility shims.

## Social and Feed

- `GET /api/v1/social/blocked` - native route present, no Step 11 change needed.
- `POST /api/v1/social/block/:userId` - native route present, no Step 11 change needed.
- `DELETE /api/v1/social/block/:userId` - native route present, no Step 11 change needed.
- `GET /api/v1/feed` - native route present, no Step 11 change needed.
- `GET /api/v1/posts/:postId/comments` - native route present, no Step 11 change needed.
- `POST /api/v1/posts/:postId/share` - native route present, no Step 11 change needed.
- `POST /api/v1/posts/:postId/view` - native route present, no Step 11 change needed.

## Notifications and Moderation

- `GET /api/v1/notifications/settings` - native route present, no Step 11 change needed.
- `PATCH /api/v1/notifications/settings` - native route present, no Step 11 change needed.
- `PUT /api/v1/notifications/settings` - native route present, no Step 11 change needed.
- `POST /api/v1/notifications/device-token` - native route present, no Step 11 change needed.
- `DELETE /api/v1/notifications/device-token` - native route present, no Step 11 change needed.
- `GET /api/v1/notifications` - native route present, no Step 11 change needed.
- `GET /api/v1/notifications/unread-count` - native route present, no Step 11 change needed.
- `GET /api/v1/notifications/count` - native route present, no Step 11 change needed.
- `POST /api/v1/notifications/:id/read` - native route present, no Step 11 change needed.
- `PATCH /api/v1/notifications/:id/read` - native route present, no Step 11 change needed.
- `POST /api/v1/notifications/read-all` - native route present, no Step 11 change needed.
- `PATCH /api/v1/notifications/read-all` - native route present, no Step 11 change needed.
- `GET /api/v1/reports/reasons` - native route present, no Step 11 change needed.
- `POST /api/v1/reports` - native route present, no Step 11 change needed.

## Pets and Fundraising

- Confirmed Flutter contracts for pets and fundraising are already implemented in the current API surface.
- Step 11 does not add new compatibility shims for those areas.

## Legacy Compatibility Decision

No additional runtime compatibility routes were required for Step 11 because the confirmed Flutter contracts already resolve against the new implementation.

The only Step 11 change is controlled data-migration tooling plus documentation for rollback and cutover.

