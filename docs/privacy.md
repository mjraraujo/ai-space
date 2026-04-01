# Privacy Documentation

## Zero-Knowledge Architecture

AI Space is designed so that no one — not even the developers — can access your data. There is no server, no account, no analytics.

## Encryption Specifications

### Algorithm
- **Cipher**: AES-256-GCM (Galois/Counter Mode)
- **Key derivation**: PBKDF2 with 100,000 iterations
- **Hash**: SHA-256
- **IV**: 12-byte random nonce per encryption operation

### Key Material
The encryption key is derived from a device fingerprint composed of:
- User agent string
- Browser language
- Screen dimensions and color depth
- Timezone
- Static application salt

This means your data can only be decrypted on the same device and browser profile where it was created.

### What's Encrypted
All IndexedDB stores are encrypted:
- Conversation messages
- User preferences
- Audit log entries
- Shared content from iOS Shortcuts

## Local Mode Guarantees

In **local mode** (the default):

1. **No network calls**: The AI model runs entirely via WebGPU in your browser
2. **No data exfiltration**: No analytics, tracking pixels, or telemetry
3. **No server dependency**: The app works fully offline after first load
4. **Model weights cached locally**: Downloaded once, cached in browser storage
5. **No cookies**: No server-side session tracking

## Hybrid Mode Transparency

In **hybrid mode**:

1. You explicitly approve every cloud API call before it happens
2. Each cloud call is logged in the audit log with full details
3. The trust dashboard shows the total count of cloud calls
4. Only the specific prompt is sent — never your conversation history

## Cloud Mode

In **cloud mode**:

1. Messages are sent to the configured cloud API endpoint
2. All cloud calls are logged in the audit log
3. Local encryption still protects stored conversations
4. You can switch back to local mode at any time

## Data Portability

- **Export**: Download all your data as JSON at any time
- **Delete**: Clear all data from the device with one action
- **No lock-in**: Your data is never stored anywhere except your device

## Audit Trail

Every action taken by the AI is logged:
- What type of action (read, suggestion, cloud call, etc.)
- When it happened
- What mode was active
- Relevant details

The audit log itself is encrypted and stored alongside your other data.
