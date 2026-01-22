# EduCareTrack Field Name Mappings

This document outlines the correct field names for Supabase tables and common mapping issues.

## Table and Field Names (Supabase Schema)

### Users Table
- `id` (text, primary key)
- `username` (text, unique)
- `email` (text, unique)
- `password` (text)
- `name` (text)
- `role` (text: admin, teacher, parent, guard, clinic)
- `phone` (text)
- `photo_url` (text)
- `is_active` (boolean, default: true)
- `last_login` (timestamp)
- `created_at` (timestamp)
- `updated_at` (timestamp)
- `children` (array)
- `class_id` (text) ← **IMPORTANT: Use this, not classId**
- `is_homeroom` (boolean)
- `assigned_classes` (array)
- `assigned_subjects` (array)

### Students Table
- `id` (text, primary key)
- `lrn` (text)
- `first_name` (text)
- `last_name` (text)
- `gender` (text)
- `birth_date` (timestamp)
- `address` (text)
- `class_id` (text)
- `parent_id` (text)
- `strand` (text)
- `current_status` (text) ← **IMPORTANT: Use this, not currentStatus**
- `photo_url` (text)
- `created_at` (timestamp)
- `updated_at` (timestamp)

### Attendance Table
- `id` (uuid, primary key)
- `student_id` (text)
- `class_id` (text)
- `entry_type` (text) ← **IMPORTANT: Use this, not entryType**
- `timestamp` (timestamp)
- `time` (text)
- `session` (text)
- `status` (text)
- `remarks` (text)
- `time_in` (text)
- `time_out` (text)
- `method` (text)
- `recorded_by` (text)
- `recorded_by_name` (text)
- `manual_entry` (boolean)

### Clinic Visits Table
- `id` (uuid, primary key)
- `student_id` (text)
- `student_name` (text)
- `class_id` (text)
- `reason` (text)
- `check_in` (boolean) ← **IMPORTANT: Use this, not checkIn**
- `timestamp` (timestamp)
- `notes` (text)
- `treated_by` (text)
- `outcome` (text)

### Notifications Table
- `id` (uuid, primary key)
- `targetUsers` (array) ← **Note: camelCase in schema**
- `title` (text)
- `message` (text)
- `type` (text)
- `is_active` (boolean, default: true)
- `createdAt` (timestamp) ← **Note: camelCase in schema**
- `readBy` (array) ← **Note: camelCase in schema**

## Common Field Name Issues Fixed

### 1. Class ID References
- ❌ `classId` → ✅ `class_id`
- Fixed in: teacher-dashboard.html, teacher-dashboard.js

### 2. Student ID References  
- ❌ `studentId` → ✅ `student_id`
- Fixed in: Dashboard statistics and activity loading

### 3. Entry Type References
- ❌ `entryType` → ✅ `entry_type`
- Fixed in: Activity display and filtering

### 4. Student Status References
- ❌ `currentStatus` → ✅ `current_status`
- Fixed in: Student status counting and display

### 5. Check In References
- ❌ `checkIn` → ✅ `check_in`
- Fixed in: Clinic visit queries

### 6. Notification Read Status
- ❌ `readBy` → ✅ `read_by`
- Fixed in: Notification loading and handling

## Database Access Patterns

### Supabase (Preferred)
```javascript
// Correct pattern
const { data, error } = await window.supabaseClient
    .from('students')
    .select('id,first_name,last_name,class_id,current_status')
    .eq('class_id', classId);

// Use snake_case field names
record.student_id
record.entry_type
record.current_status
```

### Firestore (Fallback)
```javascript
// Correct pattern
const snapshot = await EducareTrack.db
    .collection('students')
    .where('class_id', '==', classId)
    .get();

// Still use snake_case field names for consistency
record.student_id
record.entry_type
record.current_status
```

## Timestamp Handling

### Supabase
- Timestamps are ISO strings or Date objects
- Use directly: `new Date(timestamp)`
- No `.toDate()` method needed

### Firestore
- Timestamps are Firestore Timestamp objects
- Use: `timestamp.toDate()`
- Convert to Date for formatting

## Fixed Files

1. **teacher-dashboard.html**
   - Fixed `loadDashboardStats()` to use proper Supabase queries
   - Fixed field names: `class_id`, `student_id`, `entry_type`, `current_status`
   - Fixed timestamp handling for both Supabase and Firestore

2. **teacher-dashboard.js**
   - Fixed all field name references
   - Updated database access patterns
   - Fixed notification handling

## Testing Checklist

- [ ] Dashboard statistics load correctly
- [ ] Present/late/clinic counts are accurate
- [ ] Recent activity displays properly
- [ ] Student status overview is correct
- [ ] Notifications load and display
- [ ] Timestamp formatting works
- [ ] Both Supabase and Firestore fallbacks work

## Notes

- Always use snake_case for database field names
- Use proper Supabase client when available
- Include Firestore fallbacks for compatibility
- Test with both database backends
