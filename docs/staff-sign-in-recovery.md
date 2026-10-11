# Staff sign-in recovery

Authenticator apps are turned on in the Supabase dashboard by a Platform Admin. The product will not require them until a Platform Admin is enrolled and one of these is true:

- a second Platform Admin has an authenticator app, or
- the Platform Admin who turns the requirement on still has unused recovery codes.

That check lives in `staff_mfa_set_enforced`. It is what keeps a Platform Admin from being locked out.

## If someone loses the app

1. They open Sign-in recovery and enter one unused recovery code.
2. The code works once and stands in for the app for 15 minutes.
3. In that window they open Authenticator setup, replace the old app, and store the new codes.

## If a Platform Admin has no codes and no second admin

Do not turn enforcement on. Add another Platform Admin, have them enroll, then turn it on.

If enforcement is already on and every Platform Admin is locked out, a person with Supabase dashboard access can unenroll factors or turn off the dashboard requirement, then sign in with a password and enroll again. The product switch can be turned off from Sign-in once someone is back in.

Existing staff have 7 days after enforcement starts (or after they join, whichever is later) before the app is required.
