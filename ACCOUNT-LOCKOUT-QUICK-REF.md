# 🔒 Account Lockout - Quick Reference

## Overview

Accounts are automatically locked for **15 minutes** after **5 failed login attempts**.

## Key Features

- ✅ Protects against brute force attacks
- ✅ Progressive warnings at 2 and 1 attempts remaining
- ✅ Automatic unlock after 15 minutes
- ✅ Resets on successful login
- ✅ Works on all login endpoints

## Response Codes

| Code                      | Meaning                     | User Action                  |
| ------------------------- | --------------------------- | ---------------------------- |
| 401                       | Wrong password              | Try again (attempts tracked) |
| 401 + `attemptsRemaining` | Wrong password with warning | Be careful, lockout coming   |
| 423                       | Account locked              | Wait for lockout to expire   |

## Warnings to Users

**Attempts 1-3:** "Invalid credentials"  
**Attempt 4:** "Invalid credentials. 1 attempt(s) remaining before account lockout."  
**Attempt 5:** "Account has been temporarily locked for 15 minutes..."  
**While Locked:** "Account is temporarily locked. Please try again in X minute(s)."

## Admin Commands

### Unlock Account Manually

```bash
# MongoDB Shell
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } }
)
```

### Find Locked Accounts

```bash
db.users.find({ lockUntil: { $gt: new Date() } })
```

### Find Accounts with Failed Attempts

```bash
db.users.find({ loginAttempts: { $gt: 0 } })
```

## Testing

Run the test suite:

```bash
npm run test-account-lockout
```

## Configuration

Edit `src/models/User.js`:

```javascript
const MAX_LOGIN_ATTEMPTS = 5; // Change max attempts
const LOCK_TIME = 15 * 60 * 1000; // Change lockout duration
```

## Logs to Monitor

```
⚠️  Failed login attempt for user@example.com. Attempts: 3/5
🔒 Login attempt on locked account: user@example.com. Locked for 12 more minutes.
✅ Login attempts reset for user@example.com after successful login
```

## Frontend Integration

```javascript
// Handle lockout in login form
if (error.response?.status === 423) {
	showError(`Account locked. Try again in ${lockTimeRemaining} minute(s).`);
} else if (error.response?.data?.attemptsRemaining <= 2) {
	showWarning(`${attemptsRemaining} attempts remaining`);
}
```

## Security Notes

- Lockout applies per email/account (not per IP or device)
- Lockout timer does NOT reset with more failed attempts
- Successful login immediately resets counter
- Works on both `/api/auth/login` and `/api/auth/login-profile`

---

📚 Full Documentation: `docs/ACCOUNT-LOCKOUT.md`
