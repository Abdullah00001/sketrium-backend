# Flutter: Business Name and Picture Removal

This guide describes the current backend implementation. Use the app's configured
API host with the `/api/v1` prefix. Confirm that the backend changes are deployed
to the environment used by the app.

## 1. Endpoint reference

Protected requests require `Authorization: Bearer <accessToken>`.
Paths below include `/api/v1`.

| Action | Method and path | Authentication | User location in response |
| --- | --- | --- | --- |
| Organiser registration with social profile | `POST /api/v1/social/register` | None | Registration returns `data.email` |
| Verify that registration | `POST /api/v1/social/verify-email` | None | `data.user`; token at `data.accessToken` |
| Update organiser, merchant or DJ profile | `PATCH /api/v1/social/update-profile` | Required | `data.user` |
| Get own organiser, merchant or DJ profile | `GET /api/v1/social/profile` | Required | `data.user` |
| Update regular user profile | `PATCH /api/v1/users/update-profile` | Required | `data` |
| Get own regular user profile | `GET /api/v1/users/me` | Required | `data` |
| Get an organiser's profile | `GET /api/v1/users/organizer-profile/{userId}` | Required | `data.user` |

Use the endpoint matching the account role. API role values are `ORGANIZER`,
`MARCHANT` (this spelling is intentional), `KAATEDJ`, and `USER`.

## 2. Business Name

Add a **Business Name** text input to organiser registration and edit profile.
The JSON/form-data key is exactly `businessName`. It is separate from `fullName`
and the social profile's `shopName`.

- Require a nonblank value on the organiser registration screen.
- Trim leading and trailing whitespace before submission. Storage also trims it.
- In edit profile, send the field only when saving a new value. Omission preserves it.
- An explicit blank, whitespace-only, null or non-string update is rejected.
- Existing accounts may have a missing or empty value. Keep the Flutter model nullable
  and display a fallback such as `fullName` when needed.
- There is no business-name clearing operation in this contract.

### Register an organiser

`POST /api/v1/social/register`, `Content-Type: application/json`:

```json
{
  "fullName": "Alex Morgan",
  "businessName": "City Skate Events",
  "email": "alex@example.com",
  "password": "example-password-123",
  "confirmPassword": "example-password-123",
  "role": "ORGANIZER",
  "country": "United Kingdom",
  "termsAccepted": true,
  "subscribeToEmails": false
}
```

The social registration endpoint requires `businessName` for `ORGANIZER`.
Passwords must match and contain at least six characters. Keep the existing
registration fields and add `businessName`; the example is not a replacement for
other information collected by your app.

Registration returns HTTP 201 with `data.email`; it does not log the user in.
Complete verification using the matching social endpoint:

`POST /api/v1/social/verify-email`:

```json
{
  "email": "alex@example.com",
  "code": "123456"
}
```

The verification response contains `data.user.businessName` and
`data.accessToken`. Send the OTP as `code`, not `otp`.

For registration with an initial picture, use multipart form-data and the file
field `image`. Business Name remains a text field. Registration's file field
name differs from social profile updates.

### Existing auth registration flow

If the app already uses `POST /api/v1/auth/userRegistration`, add `businessName`
to that existing request and continue verifying through
`POST /api/v1/auth/verify-email` with `email` and `code`.
The name is saved during verification and returned at `data.user.businessName`.
Do not mix the auth and social registration/verification pairs.

Implementation detail relevant to validation: the current auth registration route
uses the email-request validator, so it does not enforce the organiser business-name
requirement at the route level. Flutter should still require the field for
organisers. The social registration endpoint enforces it on the backend.

### Update Business Name

`PATCH /api/v1/social/update-profile`:

```json
{
  "businessName": "City Skate Events Ltd"
}
```

Relevant fields in the HTTP 200 response (other fields omitted):

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "_id": "USER_ID",
      "fullName": "Alex Morgan",
      "businessName": "City Skate Events Ltd"
    },
    "socialLinks": null
  }
}
```

Read Business Name from the user object in profile responses. It is also included
in organiser role listings and populated event host details. Do not read it from
`socialLinks` or send it as a nested `user` object in update requests.

## 3. Remove profile and background pictures

The UI term **background picture** corresponds to API field `coverImage`.
The profile picture is stored as `image`.

Use the existing PATCH profile endpoint with either or both removal flags.
No file upload is required for removal.

| Request field | JSON value | Multipart text value | Returned user field |
| --- | --- | --- | --- |
| `removeProfileImage` | `true` | `"true"` | `image: null` |
| `removeCoverImage` | `true` | `"true"` | `coverImage: null` |

Example: remove both pictures and update Business Name in one organiser request:

`PATCH /api/v1/social/update-profile`:

```json
{
  "businessName": "City Skate Events",
  "removeProfileImage": true,
  "removeCoverImage": true
}
```

Relevant response fields (other fields omitted):

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "_id": "USER_ID",
      "businessName": "City Skate Events",
      "image": null,
      "coverImage": null
    },
    "socialLinks": null
  }
}
```

For `USER`, send the same removal flags to `/api/v1/users/update-profile`.
That endpoint returns the updated user directly inside `data`, without a `user`
wrapper.

### Removal rules

- Omitted flags, `false`, and `"false"` leave that picture unchanged.
- Removing a picture that is already absent succeeds.
- Both pictures can be removed together, or each can be removed independently.
- Do not upload and remove the same picture in one request; this returns HTTP 400.
- Removing one picture while uploading the other is supported by social profile updates.
- Use removal flags rather than an empty URL, empty file, or `image: null` request.
- Do not resend the existing image object when removing it; that conflicts with removal.
- The server handles stored-file cleanup after saving the profile change.

### File field names when replacing pictures

| Endpoint | Profile picture upload | Background picture upload |
| --- | --- | --- |
| `POST /social/register` | `image` | Not supported by this upload handler |
| `PATCH /social/update-profile` | `profileImage` | `coverImage` |
| `PATCH /users/update-profile` | `image` | Not supported by this upload handler |

All paths in this table are relative to `/api/v1`. Regular users can still remove
an existing cover image using `removeCoverImage`.

## 4. Flutter request example (Dio)

This example assumes the app already uses Dio and its `baseUrl` ends in
`/api/v1`. Use the app's existing authenticated HTTP client if different.

```dart
import 'package:dio/dio.dart';

Future<Map<String, dynamic>> updateProfile({
  required Dio dio,
  required String accessToken,
  required String role,
  String? businessName,
  bool removeProfileImage = false,
  bool removeCoverImage = false,
}) async {
  final isRegularUser = role == 'USER';
  final body = <String, dynamic>{};

  if (businessName != null) {
    final trimmedName = businessName.trim();
    if (trimmedName.isEmpty) {
      throw ArgumentError('Business Name cannot be blank');
    }
    body['businessName'] = trimmedName;
  }
  if (removeProfileImage) body['removeProfileImage'] = true;
  if (removeCoverImage) body['removeCoverImage'] = true;

  final response = await dio.patch<Map<String, dynamic>>(
    isRegularUser ? '/users/update-profile' : '/social/update-profile',
    data: body,
    options: Options(headers: {
      'Authorization': 'Bearer $accessToken',
      'Content-Type': 'application/json',
    }),
  );

  final envelope = response.data!;
  if (envelope['success'] != true) {
    throw StateError(envelope['message'] as String? ?? 'Update failed');
  }
  final data = Map<String, dynamic>.from(envelope['data'] as Map);
  return isRegularUser
      ? data
      : Map<String, dynamic>.from(data['user'] as Map);
}
```

For a multipart social update, create `FormData` with text fields such as
`'removeCoverImage': 'true'` and any selected file under `profileImage`.
Let Dio set multipart content type and its boundary.

### Applying the response to Flutter state

After success, use the returned user to update local profile state. Explicit null
values must clear the old image; avoid expressions such as
`newImage ?? oldImage`, which would keep the removed picture visible.

```dart
String? pictureUrl(dynamic picture) {
  if (picture is! Map) return null;
  final url = picture['url'];
  return url is String && url.isNotEmpty ? url : null;
}

// `user` is the map returned by updateProfile above.
final profileImageUrl = pictureUrl(user['image']);
final coverImageUrl = pictureUrl(user['coverImage']);
final businessName = (user['businessName'] as String?)?.trim();
```

Show a placeholder when a URL is absent. On a failed request, retain the current
pictures and display the backend error message. Disable repeated save/remove
requests while one is pending.

## 5. Validation and handoff checklist

HTTP 400 removal validation messages include:

- `removeProfileImage must be true or false`
- `removeCoverImage must be true or false`
- `Cannot remove and replace image in the same request`
- `Cannot remove and replace coverImage in the same request`

Business-name updates reject invalid values with
`Business name must be a nonblank string`.
Use the normal login/token-refresh flow for authentication failures.

Before release, verify:

- Organiser registration saves Business Name through OTP verification.
- Editing Business Name persists after refreshing the profile.
- Existing accounts without a name render correctly and can add one.
- Each picture's Remove action clears only that picture.
- Removing both pictures works and remains cleared after refreshing/reopening.
- Removing an already absent picture succeeds.
- A social update can remove the cover while replacing the profile picture.
- Conflicting remove/upload requests show an error without changing local state.
- Both JSON and multipart requests use the correct field names and response nesting.
