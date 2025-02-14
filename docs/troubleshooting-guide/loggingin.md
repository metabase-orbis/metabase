# Logging in

People can log in to Metabase in several different ways, each of which may require different background knowledge or a different line of investigation to fix if there are problems.

## Troubleshooting Process

1. Try to log in with a local account.
2. Try to log in with a Google Auth SSO account.
3. Check JavaScript and server logs.

You may also want to check [our troubleshooting guide for LDAP](./ldap.html).

## Specific Problems

### Forgotten Password

[This FAQ][reset-password] will tell you what to do if someone has forgotten their password.

### Invalid Google Auth Token

When you sign in with Google Auth, it creates a token to prove that you have authenticated. If this token becomes invalid for any reason (such as a change in configuration or a timeout) then you won't be able to log in with it.

**How to detect this:** Open the JavaScript console in your browser. Try to log in with Google Auth and see if there are any error messages in the JavaScript console indicating an invalid account. You can also open your server logs and see if there are any errors related to authentication. If there are, try recreating the token.

**How to fix this:** Remove the old token from the Google Auth SSO tab in the Admin Panel and create a new one. If the root cause was an invalid auth token, this should fix the problem.

[reset-password]: ../faq/using-metabase/how-do-i-reset-my-password.html
