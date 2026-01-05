# Chatra Operations Runbook

## Super-Admin Account Management

### Overview
The platform has a **super-admin account** with elevated privileges:
- Can clear all bans/mutes at the collection level
- Cannot be banned or muted by regular admins
- Has emergency override capabilities

> **IMPORTANT**: The actual super-admin UID is stored in a secure vault and should NEVER be committed to version control. Access the UID from:
> - **Production**: HashiCorp Vault at `secret/chatra/super-admin-uid` or environment variable `CHATRA_SUPER_ADMIN_UID`
> - **Development**: Contact platform owner for access credentials

### Security Risks
1. **Compromised Account**: If the super-admin credentials are compromised, an attacker could:
   - Unban malicious users
   - Remove all mutes
   - Disrupt moderation efforts

2. **Account Deletion**: If the account is accidentally deleted from Firebase Auth, the hardcoded UID becomes useless.

### Recommended: Migrate to Custom Auth Claims (HIGH PRIORITY)
Instead of hardcoding UIDs, use Firebase Custom Claims for elevated privileges:

1. **Set custom claim on super-admin account**:
   ```javascript
   // Run via Firebase Admin SDK (server-side only)
   admin.auth().setCustomUserClaims(superAdminUid, { superAdmin: true });
   ```

2. **Update security rules** to check claims instead of UID:
   ```json
   ".write": "auth.token.superAdmin === true"
   ```

3. **Benefits**:
   - No sensitive UIDs in version control
   - Easy rotation without rule changes
   - Can grant/revoke privileges without code deployment

### Credential Management
1. Store super-admin credentials in a secure vault (e.g., 1Password, HashiCorp Vault)
2. Enable 2FA on the Firebase account
3. Limit access to credentials to platform owner only
4. Document recovery email and phone number separately (in vault, not here)

### Recovery Procedures

#### If Super-Admin Account is Compromised:
1. Immediately change the password via Firebase Console
2. Review audit logs for unauthorized actions
3. Manually restore any incorrectly unbanned users
4. Rotate to a new account and update custom claims

#### If Super-Admin Account is Deleted:
1. Create a new Firebase Auth account
2. Set the `superAdmin: true` custom claim on the new account
3. Update vault with new UID (if still using UID-based rules)
4. Deploy updated rules if necessary

---

## Group memberCount Management

### Design Decision
The `memberCount` field in groups is maintained with **eventual consistency** rather than strict transactional consistency in security rules.

### Why This Approach?
Firebase Realtime Database security rules cannot reliably enforce atomic increment/decrement across multiple paths (members + memberCount) without race conditions. Attempting to do so creates:
- Complex, unmaintainable rules
- Race conditions when multiple users join/leave simultaneously
- Validation errors that block legitimate operations

### Current Implementation
1. **Security Rules**: Enforce only basic sanity checks:
   - Value must be a number >= 0
   - Value must not exceed maxMembers (if set)
   - Only owner/admins can write

2. **Client-side Updates**: memberCount is updated optimistically by clients when joining/leaving groups

3. **Known Limitation**: memberCount may drift from actual member count under concurrent operations

### Future Enhancement (Optional)
If drift becomes problematic, implement Cloud Functions:
- `onMemberAdded`: Increment memberCount atomically via transaction
- `onMemberRemoved`: Decrement memberCount atomically via transaction
- Scheduled reconciliation to repair drift and alert on discrepancies

### Monitoring
Set up alerts for:
- memberCount discrepancies > 5
- Groups where memberCount < 0 (should never happen)
- Groups where memberCount > actual member count by >10%

### Known Limitations
- memberCount may briefly be out of sync after rapid join/leave operations
- UI should treat memberCount as approximate, not exact
- For accurate counts, always count the `members` object directly

---

## Device Fingerprinting & Consent

### Overview
Device fingerprinting is used to prevent ban evasion. Two consent levels exist:

1. **Basic Device Fingerprint** (non-canvas): Collected by default for security
2. **Canvas Fingerprint** (opt-in): More unique but regulated under CCPA

### Consent Records
- `users/{uid}/deviceConsentRecord`: Controls whether fingerprint can be stored
- `users/{uid}/canvasConsentRecord`: Controls canvas-based fingerprinting

### User Opt-Out Flow
1. User goes to Settings > Privacy
2. Toggles off "Device Identification"
3. System sets `deviceConsentRecord.granted = false`
4. Stored fingerprint is deleted
5. No new fingerprint is stored on subsequent logins

### Privacy Compliance
- All fingerprinting is disclosed in Privacy Policy
- Users can opt-out at any time
- Opt-out is respected across all auth flows
