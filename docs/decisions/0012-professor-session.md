# 0012 — Phase 2.2: the professor session cookie

Date: 2026-07-23. Phase 2.2. Author: frontend engineer (Claude).

Professor sign-in returns a short-lived JWT (8 h HS256, decision 0009). It is
stored the same way the seat token is (decision 0011): an httpOnly cookie set by
the server, so Server Components can call the professor API directly and the
credential never reaches client JavaScript. Two things differ from the seat
session and are the reason this is recorded rather than folded into 0011. First,
the cookie's life matches the token, about eight hours, not the seat's year: a
professor account is a real credential that should lapse, unlike a pseudonymous
seat whose reusable code is its own recovery path. Second, professors get a
sign-out surface (a server action that clears the cookie), which seats
deliberately never have, because a shared teaching machine is a realistic
professor context and there is a real identity to sign out of. Login failure
copy stays exactly the backend's one generic line ("Email or password is
incorrect."), never distinguishing unknown email from wrong password, matching
the backend's identical body and timing (backend 7.1). Self-serve signup has no
screen yet; whether professors self-register or are provisioned is an open
product question, so accounts are created through the API until it is decided.
