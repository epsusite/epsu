Run these in order in Supabase SQL Editor.

Use one file at a time:

1. `1.sql` - prerequisite schema changes, trigger, and RLS policies
2. `2.sql` - `ensure_regional_memberships`
3. `3.sql` - `apply_to_school_epsu`
4. `4.sql` - `review_school_application`
5. `5.sql` - `leave_school_epsu`
6. `6.sql` - `kick_school_epsu_member`
7. `7.sql` - `create_school_epsu`
8. `8.sql` - feed access, school/public join restrictions, and query/policy fixes
9. `9.sql` - store school creator on pending school without activating ownership yet
10. `10.sql` - real admin flag, creator review notifications, and cleanup of obsolete 4-arg school creation SQL
11. `11.sql` - mandatory school logo uploads, storage bucket/policies, and logo review data
12. `12.sql` - owner membership on school creation and removal of 3-school cap
13. `13.sql` - admin fetch for regional Epsu suggestions
14. `14.sql` - country-based regional suggestion votes and aggregated admin view
15. `15.sql` - admin approve/reject for aggregated regional Epsu suggestions
16. `16.sql` - approving a regional suggestion creates a live regional Epsu
17. `17.sql` - delete legacy pending regional suggestions with no country code

If one fails, tell me the file number and the exact error.
