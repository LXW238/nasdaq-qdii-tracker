# Security Specification & Payload-First TDD (`security_spec.md`)

## 1. Data Invariants

1. **Strict Ownership Isolation**: Every user profile (`/users/{userId}`), watchlist entry (`/users/{userId}/watchlist/{fundCode}`), and holding record (`/users/{userId}/holdings/{fundCode}`) is private to its owner (`request.auth.uid == userId`) with verified email (`request.auth.token.email_verified == true`).
2. **Master Gate Relational Sync**: Watchlist items and holdings may only be created or updated when the parent `/users/{userId}` document exists.
3. **Fund Code Format Integrity**: Every `fundCode` document ID and field must strictly match 6 ASCII digits (`^[0-9]{6}$`) and match the path variable.
4. **Immutable Audit Fields**: `uid`, `ownerId`, `fundCode`, and `createdAt` can never be mutated after creation.
5. **Server Timestamp Enforcement**: `createdAt` (on create) and `updatedAt` (on create and update) must equal `request.time`.
6. **Zero Shadow Fields & Volumetric Guards**: Every string enforces explicit `.size()` bounds; every numeric financial field enforces strict positive upper/lower bounds (`shares`, `costNav`, `beta`); unknown keys are rejected via `hasOnly()`.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)

1. **Unauthenticated Read**: `GET /users/alice/holdings/270023` with `auth = null`.
2. **Unverified Email Spoof**: `CREATE /users/alice` with `auth.uid = 'alice'`, `email_verified = false`.
3. **Cross-User Read (PII/Portfolio Leak)**: `GET /users/bob/holdings/270023` while signed in as `alice`.
4. **Cross-User List Scraping**: `LIST /users/bob/watchlist` while signed in as `alice`.
5. **Identity Spoofing on Create**: `CREATE /users/alice/holdings/270023` with `{ ownerId: "bob", ... }`.
6. **Shadow Field Injection on Create**: `CREATE /users/alice/holdings/270023` adding `"isAdmin": true`.
7. **Shadow Update Injection**: `UPDATE /users/alice/holdings/270023` adding `"role": "admin"`.
8. **Immutable Field Tampering**: `UPDATE /users/alice/holdings/270023` modifying `createdAt` or `fundCode`.
9. **Client Timestamp Forgery**: `CREATE /users/alice/watchlist/270023` with `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`.
10. **ID Poisoning**: `CREATE /users/alice/watchlist/../../malicious_1500_byte_id` (fails `^[0-9]{6}$`).
11. **Value Poisoning (Negative/Extreme Financial Numbers)**: `UPDATE /users/alice/holdings/270023` with `{ shares: -500, costNav: "nan" }`.
12. **Orphaned Subcollection Write**: `CREATE /users/alice/holdings/270023` before `/users/alice` exists.
