# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: Welcome Back
      - generic [ref=e6]: Sign in to your account using Google
    - generic [ref=e7]:
      - button "Continue with Google" [ref=e8]:
        - img
        - text: Continue with Google
      - generic [ref=e9]:
        - text: Don't have an account?
        - link "Sign up" [ref=e10] [cursor=pointer]:
          - /url: /signup
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e16] [cursor=pointer]:
    - img [ref=e17] [cursor=pointer]
  - alert [ref=e20]
```