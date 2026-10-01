# 0092: Secrets live outside the working tree, and git is told so in advance

The EC2 instance key, `tiro_key.pem`, was written into the repository root and
reached a public commit, because the commit that carried the deployment work was
staged with `git add -A` and nothing had told git the file was not ours to
track. The key was removed and must be rotated; that part is incident response,
not a decision. The decision is what changes so it cannot recur.

Credentials live outside the working tree. An SSH key belongs in `~/.ssh` at
mode 600, environment values belong in `/etc/tirocinium/tirocinium.env` at 0640
on the host, and neither has a home under the repository root even temporarily,
because "temporarily" is precisely how long it takes for the next `git add -A`
to find it. `.gitignore` names key shapes (`*.pem`, `*.key`, `*.p12`, `*.pfx`,
`id_rsa*`) rather than the one filename that caught us, since a rule written
around a single incident only prevents that incident.

The rule is worth stating plainly because the usual protection did not apply.
`.env` was ignored from the beginning and never came close to being committed.
The key was not: it arrived later, from a different workflow (AWS hands you a
`.pem` download, and the obvious place to put it is wherever you happen to be),
and landed in the one window where the repository was being staged wholesale.
Secrets do not reach version control through carelessness about secrets. They
reach it through a file arriving by a path nobody had thought to close.

A corollary for deploys: a key that has been public is compromised even after
the history is rewritten, because GitHub keeps unreachable objects fetchable by
their hash and anything public is assumed captured the moment it lands. The
remedy is always a new keypair, never a cleaner history. The deployment guide
says so at the step where the keypair is created, which is the only place a
reader is holding one.
