# 0065: Self-serve professor signup, and two quiet doors on the landing

Date: 2026-08-12. Milestone 9.6 (web). Author: frontend engineer.

Decision 0012 left open whether professors self-register or are provisioned, so
the splash stayed brand-only and accounts were created only through
`POST /api/v1/auth/signup`. Backend guide 7.1 already says a professor signs up
with email, and a cold visit to `/` could not join or even find `/enter`. This
closes that: professors self-register at `/sign-up`, which is the same AuthOut
cookie path as sign-in (decision 0012), and the landing carries two doors in a header over the hero, rendered as the button
primitive (Sign in primary, Enter course quiet) rather than a pitch. Signup
is reached from sign-in, not as a third splash CTA, so guide 3.1's quiet brand
moment stays. The signup screen still posts only email and password, which is
all SignupIn and the users table accept; confirm password is checked in the
browser and never sent. Duplicate email is the backend's 409, shown honestly; a
short password is refused before the round trip (the SignupIn floor of ten
characters); an outage uses the same generic recovery line as other mutations.
Institutional SSO remains future work and does not block self-serve email. The
seeded journeys still mint a professor out of band, because they need a course
and a seat, not because the screen is missing.
