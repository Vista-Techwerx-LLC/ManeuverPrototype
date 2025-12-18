# Instructor/Student Features

This document describes the new instructor/student relationship features that allow flight instructors to review student progress.

## Database Setup

Run the updated SQL in `supabase-setup.sql` to create the `instructor_relationships` table.

## Features

### 1. Friends/Instructors Management (`/friends`)

- **Send Invites**: Students can invite instructors by email
- **Accept/Decline**: Instructors can accept or decline invites
- **View Connections**: See all connected instructors/students
- **Remove Connections**: Remove friends/instructors

### 2. Student Progress View (`/view-student/:studentId`)

Instructors can view:
- **Statistics**: Total maneuvers, pass/fail counts, pass rate
- **Progress Charts**:
  - Pass/Fail trend over time
  - Max altitude deviation chart
  - Max airspeed deviation chart
  - Rollout heading error chart
  - Average bank angle trend
- **Recent Maneuvers**: Expandable list of all maneuver attempts with detailed breakdowns

## How It Works

1. **Student invites instructor**:
   - Student goes to `/friends`
   - Enters instructor's email
   - Sends invite

2. **Instructor accepts**:
   - Instructor goes to `/friends`
   - Sees pending invite
   - Clicks "Accept"

3. **Instructor views progress**:
   - Instructor goes to `/friends`
   - Clicks "View Progress" next to student
   - Sees all charts and logs

## Data Structure

The `instructor_relationships` table stores:
- `student_id`: The student's user ID
- `instructor_id`: The instructor's user ID
- `status`: 'pending', 'accepted', or 'declined'
- `invited_by`: Who sent the invite

## Charts

Charts are built using Recharts and show:
- **Line charts**: Trends over time (pass/fail, average bank)
- **Bar charts**: Deviation values per attempt

All charts are responsive and styled to match the app theme.

