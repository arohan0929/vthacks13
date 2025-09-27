# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: Create Account
      - generic [ref=e6]: Sign up with your Google account to get started
    - generic [ref=e7]:
      - button "Continue with Google" [ref=e8]:
        - img
        - text: Continue with Google
      - generic [ref=e9]:
        - text: Already have an account?
        - link "Sign in" [active] [ref=e10] [cursor=pointer]:
          - /url: /login
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e16] [cursor=pointer]:
    - img [ref=e17] [cursor=pointer]
  - alert [ref=e20]
```