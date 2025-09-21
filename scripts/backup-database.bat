@echo off
echo 🚀 MongoDB Database Backup
echo ========================

echo 📦 Starting database backup...
node scripts\backup-database.js

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ Backup completed successfully!
    echo 📁 Check the 'backups' folder for your backup files
) else (
    echo.
    echo ❌ Backup failed! Check the error messages above.
)

pause