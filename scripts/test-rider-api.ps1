# Rider API Test Script for Frischly Server
# Run this script to test all rider API endpoints

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$AdminToken = "",
    [switch]$Interactive
)

# Color output functions
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }

# Headers with authentication
$Headers = @{
    "Content-Type" = "application/json"
}

if ($AdminToken) {
    $Headers["Authorization"] = "Bearer $AdminToken"
}

Write-Host "🧪 Rider API Testing Script" -ForegroundColor Magenta
Write-Host "===========================" -ForegroundColor Magenta
Write-Info "Base URL: $BaseUrl"

if (!$AdminToken) {
    Write-Warning "No admin token provided. Some endpoints may require authentication."
    if ($Interactive) {
        $AdminToken = Read-Host "Enter admin token (or press Enter to skip)"
        if ($AdminToken) {
            $Headers["Authorization"] = "Bearer $AdminToken"
        }
    }
}

# Test 1: Get all riders
Write-Host "`n📋 Test 1: Get All Riders" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders" -Method GET -Headers $Headers
    Write-Success "Retrieved $($response.riders.Count) riders"
    Write-Info "Pagination: Page $($response.pagination.page) of $($response.pagination.pages)"
    
    if ($response.riders.Count -gt 0) {
        Write-Info "Sample rider zones: $($response.riders | Select-Object -First 3 | ForEach-Object { $_.zone } | Join-String ', ')"
    }
} catch {
    Write-Error "Failed to get riders: $($_.Exception.Message)"
}

# Test 2: Get rider statistics
Write-Host "`n📊 Test 2: Get Rider Statistics" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders/stats" -Method GET -Headers $Headers
    Write-Success "Retrieved rider statistics"
    Write-Info "Total Riders: $($response.totalRiders)"
    Write-Info "Available Riders: $($response.availableRiders)"
    Write-Info "Busy Riders: $($response.busyRiders)"
    Write-Info "Average Rating: $([math]::Round($response.averageRating, 2))"
} catch {
    Write-Error "Failed to get rider stats: $($_.Exception.Message)"
}

# Test 3: Get available riders in a zone
Write-Host "`n🗺️  Test 3: Get Available Riders in Zone" -ForegroundColor Yellow
$testZone = "Downtown"
try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders/available/$testZone" -Method GET -Headers $Headers
    Write-Success "Found $($response.riders.Count) available riders in $testZone"
    
    if ($response.riders.Count -gt 0) {
        foreach ($rider in $response.riders | Select-Object -First 2) {
            Write-Info "Rider: $($rider.user.name) - Vehicle: $($rider.vehicleType) ($($rider.vehicleNumber))"
        }
    }
} catch {
    Write-Error "Failed to get available riders: $($_.Exception.Message)"
}

# Test 4: Create a new rider profile (requires authentication)
Write-Host "`n➕ Test 4: Create New Rider Profile" -ForegroundColor Yellow
if ($AdminToken) {
    # First, let's try to find a user without a rider profile
    try {
        $testRiderData = @{
            zone = "Test Zone"
            vehicleType = "motorbike"
            vehicleNumber = "TEST-001"
            workingHours = @{
                start = "09:00"
                end = "18:00"
            }
            status = "available"
            isVerified = $false
        } | ConvertTo-Json
        
        # Note: This will fail if no user is specified, but it tests the endpoint
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders" -Method POST -Body $testRiderData -Headers $Headers
        Write-Success "Created test rider profile"
    } catch {
        if ($_.Exception.Message -like "*user*") {
            Write-Warning "Test rider creation skipped (requires valid user ID)"
        } else {
            Write-Error "Failed to create rider: $($_.Exception.Message)"
        }
    }
} else {
    Write-Warning "Skipped rider creation test (requires authentication)"
}

# Test 5: Get riders with search and filters
Write-Host "`n🔍 Test 5: Search and Filter Riders" -ForegroundColor Yellow
try {
    # Test search by zone
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders?zone=Downtown&status=available" -Method GET -Headers $Headers
    Write-Success "Search results: $($response.riders.Count) riders in Downtown zone with available status"
    
    # Test pagination
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders?page=1&limit=2" -Method GET -Headers $Headers
    Write-Success "Pagination test: Retrieved $($response.riders.Count) riders (limit: 2)"
} catch {
    Write-Error "Failed to search/filter riders: $($_.Exception.Message)"
}

# Test 6: Test individual rider details
Write-Host "`n👤 Test 6: Get Individual Rider Details" -ForegroundColor Yellow
try {
    # First get a rider ID
    $allRiders = Invoke-RestMethod -Uri "$BaseUrl/api/riders?limit=1" -Method GET -Headers $Headers
    
    if ($allRiders.riders.Count -gt 0) {
        $riderId = $allRiders.riders[0]._id
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders/$riderId" -Method GET -Headers $Headers
        Write-Success "Retrieved rider details: $($response.rider.user.name)"
        Write-Info "Zone: $($response.rider.zone), Status: $($response.rider.status)"
        Write-Info "Vehicle: $($response.rider.vehicleType) ($($response.rider.vehicleNumber))"
        Write-Info "Orders Delivered: $($response.rider.ordersDeliveredCount)"
        Write-Info "Rating: $([math]::Round($response.rider.rating.average, 2)) ($($response.rider.rating.totalRatings) ratings)"
    } else {
        Write-Warning "No riders found for individual test"
    }
} catch {
    Write-Error "Failed to get individual rider: $($_.Exception.Message)"
}

# Test 7: Update rider status (requires authentication)
Write-Host "`n🔄 Test 7: Update Rider Status" -ForegroundColor Yellow
if ($AdminToken) {
    try {
        # Get a rider to update
        $allRiders = Invoke-RestMethod -Uri "$BaseUrl/api/riders?limit=1" -Method GET -Headers $Headers
        
        if ($allRiders.riders.Count -gt 0) {
            $riderId = $allRiders.riders[0]._id
            $originalStatus = $allRiders.riders[0].status
            
            # Update status
            $updateData = @{
                status = "on-break"
                currentLocation = @{
                    latitude = 40.7128
                    longitude = -74.0060
                }
            } | ConvertTo-Json
            
            $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders/$riderId/status" -Method PATCH -Body $updateData -Headers $Headers
            Write-Success "Updated rider status from '$originalStatus' to '$($response.rider.status)'"
            
            # Update back to original status
            $revertData = @{
                status = $originalStatus
            } | ConvertTo-Json
            
            $response = Invoke-RestMethod -Uri "$BaseUrl/api/riders/$riderId/status" -Method PATCH -Body $revertData -Headers $Headers
            Write-Info "Reverted status back to '$originalStatus'"
        } else {
            Write-Warning "No riders found for status update test"
        }
    } catch {
        Write-Error "Failed to update rider status: $($_.Exception.Message)"
    }
} else {
    Write-Warning "Skipped status update test (requires authentication)"
}

# Summary
Write-Host "`n📋 Test Summary" -ForegroundColor Magenta
Write-Host "=================" -ForegroundColor Magenta
Write-Success "Rider API testing completed!"

Write-Host "`n🚀 Next Steps:" -ForegroundColor Yellow
Write-Host "1. Run the rider setup script: node scripts/setupRiders.js"
Write-Host "2. Test with authentication: ./test-rider-api.ps1 -AdminToken 'your-jwt-token'"
Write-Host "3. Use the dashboard to manage riders visually"
Write-Host "4. Integrate rider assignment with orders"

Write-Host "`n📚 Available Endpoints:" -ForegroundColor Cyan
Write-Host "GET    /api/riders              - Get all riders (with pagination/search)"
Write-Host "GET    /api/riders/stats        - Get rider statistics"
Write-Host "GET    /api/riders/:id          - Get single rider details"
Write-Host "POST   /api/riders              - Create rider profile (auth required)"
Write-Host "PUT    /api/riders/:id          - Update rider profile (auth required)"
Write-Host "PATCH  /api/riders/:id/status   - Update rider status (auth required)"
Write-Host "GET    /api/riders/available/:zone - Get available riders in zone"