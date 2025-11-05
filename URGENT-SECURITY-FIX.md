# 🔐 URGENT: Remove Exposed Credentials from Git History

## ⚠️ CRITICAL SECURITY NOTICE

Your `.env` file with sensitive credentials **may have been committed to git**. This is a severe security risk.

## 🚨 Immediate Actions Required

### 1. Check if .env was committed

```powershell
git log --all --full-history -- .env
```

If this shows any commits, **your credentials are exposed in git history**.

### 2. Remove .env from Git History

**WARNING:** This rewrites git history and will affect all team members.

```powershell
# Option 1: Using git filter-repo (recommended)
# Install: pip install git-filter-repo
git filter-repo --path .env --invert-paths --force

# Option 2: Using BFG Repo-Cleaner
# Download from: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

### 3. Force Push (Coordinate with Team!)

```powershell
git push origin --force --all
git push origin --force --tags
```

### 4. Rotate ALL Compromised Credentials

Even after removing from git, assume all credentials in the old .env are compromised:

#### MongoDB

1. Go to MongoDB Atlas
2. Change database user password
3. Update `MONGODB_URI` in new `.env`

#### JWT Secrets

```powershell
# Generate new secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Update `JWT_SECRET` and `JWT_REFRESH_SECRET`

#### Cloudinary

1. Go to Cloudinary Console → Settings → Security
2. Reset API Secret
3. Update credentials in `.env`

#### PAYONE

1. Contact PAYONE support
2. Request new Portal Key
3. Update `PORTAL_KEY` in `.env`

#### Email

1. Revoke old app password
2. Generate new app password
3. Update `EMAIL_PASS` in `.env`

### 5. Verify Protection

```powershell
# Verify .env is in .gitignore
git check-ignore .env
# Should output: .env

# Check what will be committed
git status
# .env should NOT appear
```

## 📚 Going Forward

1. **Always check before committing:**

   ```powershell
   git status
   git diff --cached
   ```

2. **Use pre-commit hooks** (recommended):

   - Install: `npm install --save-dev husky`
   - This will prevent accidental .env commits

3. **Team Coordination:**
   - Notify all team members about the history rewrite
   - Everyone needs to re-clone or fetch/reset their local repos
   - Share new credentials securely (use password manager)

## 🆘 Need Help?

If you're unsure about any step, contact the security team before proceeding.

---

**This file should be deleted after completing these actions.**
