# Account Lockout Mechanism - Documentation

## Overview

The account lockout mechanism protects user accounts from brute force attacks by temporarily locking accounts after multiple failed login attempts.

## Features

- ✅ **Automatic Lockout**: Account locks after 5 failed login attempts
- ✅ **Temporary Lock**: Account is locked for 15 minutes
- ✅ **Progressive Warnings**: Users receive warnings when 2 or fewer attempts remain
- ✅ **Automatic Reset**: Login attempts reset on successful login
- ✅ **Multiple Endpoints**: Protection applies to all login endpoints
- ✅ **Clear Feedback**: Users receive informative messages about lockout status

## Configuration

### Constants (in User model)

```javascript
const MAX_LOGIN_ATTEMPTS = 5; // Maximum failed attempts before lockout
const LOCK_TIME = 15 * 60 * 1000; // Lockout duration in milliseconds (15 minutes)
```

To adjust these values, edit `src/models/User.js` lines 148-149.

## Database Schema

New fields added to User model:

```javascript
{
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  }
}
```

## API Response Codes

### HTTP 423 - Locked

Account is temporarily locked due to failed login attempts.

**Response:**

```json
{
	"success": false,
	"message": "Account is temporarily locked due to multiple failed login attempts. Please try again in 12 minute(s).",
	"lockTimeRemaining": 12
}
```

### HTTP 401 - Unauthorized (with attempts remaining)

**Response when 2 or fewer attempts remain:**

```json
{
	"success": false,
	"message": "Invalid credentials. 2 attempt(s) remaining before account lockout.",
	"attemptsRemaining": 2
}
```

**Response when 3+ attempts remain:**

```json
{
	"success": false,
	"message": "Invalid credentials"
}
```

## User Flow

### Failed Login Attempts

1. **Attempt 1-3**: Generic "Invalid credentials" message
2. **Attempt 4**: "Invalid credentials. 1 attempt(s) remaining before account lockout."
3. **Attempt 5**: "Invalid credentials. Your account has been temporarily locked for 15 minutes..."
4. **Subsequent attempts**: HTTP 423 with time remaining

### Successful Login After Lockout Expires

1. Lockout automatically expires after 15 minutes
2. User can login with correct credentials
3. `loginAttempts` counter resets to 0
4. `lockUntil` field is removed

## Implementation Details

### User Model Methods

#### `user.isLocked` (Virtual Property)

Returns `true` if account is currently locked.

```javascript
if (user.isLocked) {
	// Account is locked
}
```

#### `user.incLoginAttempts()`

Increments failed login attempts. Automatically locks account when limit is reached.

```javascript
await user.incLoginAttempts();
```

#### `user.resetLoginAttempts()`

Resets login attempts to 0 and removes lock.

```javascript
await user.resetLoginAttempts();
```

#### `user.getLockTimeRemaining()`

Returns minutes remaining until account unlock.

```javascript
const minutes = user.getLockTimeRemaining(); // Returns 0 if not locked
```

### Login Controller Logic

```javascript
// 1. Check if account is locked
if (user.isLocked) {
	const minutesRemaining = user.getLockTimeRemaining();
	return res.status(423).json({
		success: false,
		message: `Account locked. Try again in ${minutesRemaining} minute(s).`,
		lockTimeRemaining: minutesRemaining,
	});
}

// 2. Verify password
const isMatch = await user.comparePassword(password);
if (!isMatch) {
	// Increment attempts
	await user.incLoginAttempts();

	// Calculate remaining attempts
	const attemptsLeft = 5 - (user.loginAttempts + 1);

	// Return appropriate error message
	if (attemptsLeft <= 0) {
		return res.status(401).json({
			success: false,
			message: "Account locked for 15 minutes...",
		});
	} else if (attemptsLeft <= 2) {
		return res.status(401).json({
			success: false,
			message: `Invalid credentials. ${attemptsLeft} attempt(s) remaining...`,
			attemptsRemaining: attemptsLeft,
		});
	}
}

// 3. Reset on successful login
if (user.loginAttempts > 0 || user.lockUntil) {
	await user.resetLoginAttempts();
}
```

## Testing

### Automated Test Script

Run the test suite:

```bash
npm run test-account-lockout
```

This will:

1. Attempt 6 failed logins
2. Verify account is locked
3. Test lockout on both login endpoints
4. Provide manual unlock instructions

### Manual Testing

1. **Test Failed Attempts:**

   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"wrongpassword"}'
   ```

2. **Check Account Status in MongoDB:**
   ```javascript
   db.users.findOne(
   	{ email: "test@example.com" },
   	{ loginAttempts: 1, lockUntil: 1 }
   );
   ```

## Administrative Tasks

### Manually Unlock an Account

**MongoDB Shell:**

```javascript
db.users.updateOne(
	{ email: "user@example.com" },
	{
		$set: { loginAttempts: 0 },
		$unset: { lockUntil: 1 },
	}
);
```

**Or using Node.js:**

```javascript
const user = await User.findOne({ email: "user@example.com" });
await user.resetLoginAttempts();
```

### Query Locked Accounts

```javascript
// Find all currently locked accounts
db.users.find({
	lockUntil: { $gt: new Date() },
});

// Find accounts with failed attempts
db.users.find({
	loginAttempts: { $gt: 0 },
});
```

### Monitor Suspicious Activity

```javascript
// Find accounts locked in the last 24 hours
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

db.users
	.find({
		lockUntil: { $gt: yesterday },
	})
	.count();
```

## Security Logging

The system logs the following events:

### Failed Login Attempt

```
⚠️  Failed login attempt for user@example.com. Attempts: 3/5
```

### Account Locked

```
🔒 Login attempt on locked account: user@example.com. Locked for 12 more minutes.
```

### Successful Unlock

```
✅ Login attempts reset for user@example.com after successful login
```

## Best Practices

1. **Monitor Logs**: Regularly check for patterns of failed login attempts
2. **Alert on Lockouts**: Set up monitoring to alert on multiple account lockouts
3. **User Communication**: Ensure users understand the lockout policy
4. **Adjust Thresholds**: Modify `MAX_LOGIN_ATTEMPTS` and `LOCK_TIME` based on your security needs
5. **Consider IP-based Limits**: For additional security, implement IP-based rate limiting

## Integration with Frontend

### Display Remaining Attempts

```javascript
try {
	const response = await axios.post("/api/auth/login", credentials);
} catch (error) {
	if (error.response?.status === 401) {
		const attemptsRemaining = error.response.data.attemptsRemaining;
		if (attemptsRemaining !== undefined) {
			showWarning(`${attemptsRemaining} attempts remaining before lockout`);
		}
	} else if (error.response?.status === 423) {
		const minutes = error.response.data.lockTimeRemaining;
		showError(`Account locked. Try again in ${minutes} minute(s).`);
	}
}
```

### Countdown Timer (Optional)

```javascript
if (error.response?.status === 423) {
	const lockTimeRemaining = error.response.data.lockTimeRemaining;
	startCountdown(lockTimeRemaining * 60); // Convert to seconds
}
```

## FAQ

### Q: What happens if a user forgets they're locked out and tries again?

**A:** They'll receive the same HTTP 423 response with updated time remaining. The lockout timer does not reset.

### Q: Can an admin unlock an account immediately?

**A:** Yes, use the manual unlock MongoDB command or create an admin endpoint to reset `loginAttempts` and remove `lockUntil`.

### Q: Does this protect against distributed brute force attacks?

**A:** This protects individual accounts. For distributed attacks from multiple IPs, implement IP-based rate limiting with `express-rate-limit`.

### Q: What if a user has multiple failed attempts across different devices?

**A:** All attempts are counted against the account regardless of device, as tracking is by email/account, not by session or device.

### Q: Is the lockout time strict?

**A:** Yes, the lockout lasts exactly 15 minutes from the 5th failed attempt. Virtual property `isLocked` checks if `lockUntil` is still in the future.

## Troubleshooting

### Issue: User claims they're locked but can login

**Check:** Query the database to verify `lockUntil` and `loginAttempts` fields are properly set.

### Issue: Lockout not triggering

**Check:**

1. Ensure user model includes new fields
2. Verify `incLoginAttempts()` is being called on failed login
3. Check that `+loginAttempts +lockUntil` are in the `.select()` statement

### Issue: Lockout persists after 15 minutes

**Check:**

1. Server timezone configuration
2. Database timestamp fields
3. `isLocked` virtual property logic

## Changelog

### Version 1.0 (November 5, 2025)

- Initial implementation
- 5 attempts before lockout
- 15-minute lockout duration
- Progressive warning messages
- Automatic reset on successful login
- Support for all login endpoints

---

**Last Updated:** November 5, 2025  
**Status:** ✅ Active and Production-Ready
