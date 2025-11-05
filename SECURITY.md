# Security Guidelines for Frischly Server

## 🔒 Environment Variables Setup

### Initial Setup

1. **Copy the template file:**

   ```bash
   cp .env.example .env
   ```

2. **Never commit the `.env` file to git**

   - The `.env` file is already in `.gitignore`
   - Verify before committing: `git status` should not show `.env`

3. **Generate strong secrets:**

   ```bash
   # Generate JWT Secret (Run in Node.js or terminal)
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

   # Generate JWT Refresh Secret
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

### Required Environment Variables

#### Critical Security Variables

| Variable                | Description               | How to Get                           | Security Level |
| ----------------------- | ------------------------- | ------------------------------------ | -------------- |
| `MONGODB_URI`           | MongoDB connection string | MongoDB Atlas Dashboard              | 🔴 CRITICAL    |
| `JWT_SECRET`            | JWT token signing secret  | Generate using crypto (min 64 chars) | 🔴 CRITICAL    |
| `JWT_REFRESH_SECRET`    | Refresh token secret      | Generate using crypto (min 64 chars) | 🔴 CRITICAL    |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret     | Cloudinary Console                   | 🔴 CRITICAL    |
| `PORTAL_KEY`            | PAYONE portal key         | PAYONE Merchant Account              | 🔴 CRITICAL    |
| `EMAIL_PASS`            | Email service password    | Email provider (use App Password)    | 🟡 HIGH        |

#### Configuration Variables

- `NODE_ENV`: Set to `production` for production deployments
- `PORT`: Server port (default: 3001)
- `CLIENT_URL`: Comma-separated list of allowed CORS origins
- `FRONTEND_URL`: Your frontend application URL
- `BACKEND_URL`: Your backend server URL (for webhooks)

## 🚨 Security Checklist

### Before Deployment

- [ ] All credentials are set in environment variables (no hardcoded values)
- [ ] `.env` file is NOT committed to git
- [ ] Strong JWT secrets generated (min 64 characters)
- [ ] CORS origins are properly configured (no wildcard `*` in production)
- [ ] MongoDB connection uses authentication
- [ ] Email service uses App-specific password (not account password)
- [ ] HTTPS is enabled in production
- [ ] Rate limiting is enabled in production
- [ ] Strong password policy is enforced (min 12 characters recommended)

### Regular Security Practices

- [ ] Rotate JWT secrets every 90 days
- [ ] Review and update dependencies regularly (`npm audit`)
- [ ] Monitor server logs for suspicious activity
- [ ] Keep Node.js and npm updated
- [ ] Review API access logs periodically
- [ ] Backup `.env` file securely (encrypted, offline storage)

## 🔐 Credential Management

### For Development Team

1. **Never share credentials via:**

   - Email
   - Slack/Chat
   - Screenshots
   - Public repositories

2. **Use secure methods:**

   - Password manager (1Password, LastPass, Bitwarden)
   - Encrypted files
   - Secure vault systems
   - Environment-specific configs on hosting platforms

3. **Each environment should have unique credentials:**
   - Development
   - Staging
   - Production

### Credential Rotation

If you suspect credentials have been compromised:

1. **Immediately rotate:**

   - JWT secrets (will invalidate all active sessions)
   - Database passwords
   - API keys
   - Payment gateway keys

2. **Update in:**

   - `.env` file
   - Hosting platform (Render, Heroku, etc.)
   - CI/CD pipelines

3. **Notify team members**

## 🛡️ Security Best Practices

### Database Security

- Use strong MongoDB passwords (min 16 characters, mixed case, numbers, symbols)
- Enable IP whitelisting in MongoDB Atlas
- Use read-only users for reporting/analytics
- Regular backups (automated)
- Enable MongoDB audit logging

### API Security

- Always use HTTPS in production
- Implement proper rate limiting per endpoint
- **Validate and sanitize all user inputs** ✅
  - NoSQL injection protection via `express-mongo-sanitize`
  - Custom sanitization utilities in `src/utils/sanitize.js`
  - Email sanitization on all auth endpoints
  - Query parameter validation
- Use parameterized queries (Mongoose does this by default)
- Log security events (failed logins, unauthorized access)
- **CORS properly configured** ✅
  - No wildcard origins in production
  - Origin whitelist from environment variables
  - Credentials support for authorized origins

### Input Validation & Sanitization ✅ NEW

**NoSQL Injection Protection:**

- Automatic sanitization of all request data (body, query, params)
- Removes MongoDB operators (`$gt`, `$ne`, `$where`, etc.)
- Blocks dot notation attacks (`user.password`)
- Prevents prototype pollution (`__proto__`, `constructor`)
- Logs all injection attempts for monitoring

**Available Sanitization Utilities:**

```javascript
const {
	sanitizeEmail, // Email validation & normalization
	sanitizeString, // String sanitization with length limits
	sanitizeObject, // Deep object sanitization
	sanitizeQuery, // Query parameter sanitization
	sanitizePagination, // Safe pagination params
	sanitizeSort, // Safe sort parameters
	createSafeRegex, // ReDoS-safe regex creation
	isValidObjectId, // MongoDB ObjectId validation
} = require("./src/utils/sanitize");
```

**Testing:**

```bash
npm run test-nosql-injection  # Run NoSQL injection tests
```

### Authentication

- Enforce strong password policy (min 12 characters)
- Implement account lockout after failed attempts
- Use HTTP-only cookies for tokens (prevents XSS)
- Implement refresh token rotation
- Set appropriate token expiration times

### Payment Security (PAYONE)

- Never store credit card data directly (PCI-DSS violation)
- Use PAYONE tokenization for payment data
- Always use test mode for development
- Validate webhook signatures from PAYONE
- Log all payment transactions

### Email Security

- Use App-specific passwords (not account passwords)
- Enable 2FA on email accounts
- Validate email addresses before sending
- Rate limit email sending to prevent abuse
- Use email templates to prevent injection

## 📝 Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Contact the security team directly at: [security@frischlyshop.com]
3. Provide detailed information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if available)

## 🔄 Security Updates

This document should be reviewed and updated:

- After security audits
- When adding new features
- When updating dependencies
- At least quarterly

---

**Last Updated:** November 5, 2025  
**Next Review:** February 5, 2026
