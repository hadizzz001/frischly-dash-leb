# FRISCHLY Server - Admin Users & Role Management

## Default Admin Accounts

The system comes with pre-configured admin accounts for immediate access:

### 🔑 Admin Account

- **Email**: `admin@frischly.com`
- **Password**: `Admin123!`
- **Role**: `admin`
- **Access**: Full dashboard access with administrative privileges

### 👨‍💼 Manager Account

- **Email**: `manager@frischly.com`
- **Password**: `Manager123!`
- **Role**: `manager`
- **Access**: Dashboard access with management privileges

## User Roles & Access Levels

| Role        | Access Level | Description                                |
| ----------- | ------------ | ------------------------------------------ |
| **rider**   | Profile Only | Default role for delivery riders/drivers   |
| **user**    | Profile Only | Regular customer users                     |
| **manager** | Dashboard    | Management users with elevated permissions |
| **admin**   | Dashboard    | Full administrative access                 |

## Access Control

### Dashboard Access (`/dashboard.html`)

- ✅ **admin** - Full access
- ✅ **manager** - Full access
- ❌ **user** - Redirected to profile
- ❌ **rider** - Redirected to profile

### Profile Access (`/profile.html`)

- ✅ All authenticated users can access their profile

## Management Scripts

### Create Admin Users

```bash
npm run create-admin
```

- Creates default admin and manager accounts
- Safe to run multiple times (won't create duplicates)

### User Management

```bash
# List all users
npm run manage-users list

# Update user role
npm run manage-users update-role user@example.com admin

# Delete user
npm run manage-users delete user@example.com
```

## Authentication Flow

### For Managers & Admins

1. Sign in at `/signin.html`
2. Automatically redirected to `/dashboard.html`
3. Full management interface access

### For Users & Riders

1. Sign in at `/signin.html`
2. Automatically redirected to `/profile.html`
3. Basic profile view and management

## API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - Dashboard login (managers/admins only)
- `POST /api/auth/login-profile` - Profile login (all users, role-based redirect)
- `GET /api/auth/me` - Get current user profile

### Role-Based Access

- **Dashboard login** (`/api/auth/login`) - Restricts access to managers and admins
- **Profile login** (`/api/auth/login-profile`) - Allows all users, provides appropriate redirect

## Security Features

- **Server-side role validation** - Backend enforces role requirements
- **Client-side role checking** - Frontend validates access attempts
- **JWT token authentication** - Secure token-based auth
- **Password hashing** - bcrypt with salt rounds
- **Input validation** - Express-validator for all inputs
- **Rate limiting** - API request limiting
- **CORS protection** - Cross-origin request control
- **Helmet security** - Security headers and CSP

## First Time Setup

1. **Start the server**:

   ```bash
   npm run dev
   ```

2. **Create admin users**:

   ```bash
   npm run create-admin
   ```

3. **Access the system**:
   - Navigate to `http://localhost:3001`
   - Sign in with admin credentials
   - Change default passwords after first login

## Password Security

⚠️ **Important**: Change default passwords after first login!

- Default passwords are for initial setup only
- Use strong passwords in production
- Consider implementing password change requirements
- Enable password reset functionality for production use

## User Registration

New users register with the **user** role by default. Use the management scripts to promote users to manager or admin roles as needed.

## Production Considerations

- [ ] Change default admin passwords
- [ ] Enable HTTPS
- [ ] Configure proper CORS origins
- [ ] Set up proper MongoDB security
- [ ] Implement password reset functionality
- [ ] Add logging and monitoring
- [ ] Configure proper error handling
- [ ] Set up backup procedures
