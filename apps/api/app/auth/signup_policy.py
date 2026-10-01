"""Who may create a professor account (decision 0091).

Self-serve signup (decision 0072) is right for the product and wrong for a
single-course deployment, where exactly one person should ever hold an
account and the signup page is otherwise an open door on a public hostname.

The allowlist is configuration rather than code, so the same build serves an
open deployment and a closed one, and closing a deployment is an environment
change rather than a release. An unset or empty list means open, which is what
every existing deployment and the whole test suite already assume: a control
that changes behaviour when nobody has configured it would be a trap.

This gates account creation only. It is not an authorization check and never
stands in for one: an account that exists keeps signing in on its own
credentials whatever the list later says, because revoking access is a
different act from closing the door, and conflating them would mean an
operator who edits a list silently locks out a working account.
"""

import os


def signup_allowlist() -> frozenset[str]:
    """The emails permitted to sign up, lowercased. Empty means anyone may."""
    raw = os.environ.get("TIRO_SIGNUP_ALLOWLIST", "")
    return frozenset(part.strip().lower() for part in raw.split(",") if part.strip())


def may_sign_up(email: str) -> bool:
    allowed = signup_allowlist()
    return not allowed or email.strip().lower() in allowed
