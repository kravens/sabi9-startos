# CI workflows (staged)

These three workflows belong at `.github/workflows/` but are parked here because
the initial push used a token without GitHub's `workflow` OAuth scope.

To enable CI (registry publishing) later, either:
- move them into place from a shell with the scope:
  `gh auth refresh -h github.com -s workflow`
  then `git mv ci-workflows/*.yml .github/workflows/ && git commit && git push`, or
- add them via the GitHub web UI (New file → `.github/workflows/build.yml`, paste).

They are NOT needed to build/sideload locally (`npm install && make`).
