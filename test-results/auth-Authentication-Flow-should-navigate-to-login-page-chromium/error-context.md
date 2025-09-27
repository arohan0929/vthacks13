# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: Welcome to VTHacks 13
      - generic [ref=e6]: Please sign in to access your account
    - generic [ref=e8]:
      - link "Sign In" [active] [ref=e9] [cursor=pointer]:
        - /url: /login
      - link "Create Account" [ref=e10] [cursor=pointer]:
        - /url: /signup
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e16] [cursor=pointer]:
    - img [ref=e17] [cursor=pointer]
  - alert [ref=e20]
```