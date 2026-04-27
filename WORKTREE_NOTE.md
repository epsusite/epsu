# Worktree Note

This repository currently has a dirty worktree.

What that means:
- There are modified tracked files.
- There are untracked new files.
- You should not run broad commits unless you first review exactly what is being staged.

Safe checks:

```powershell
git status --short
git diff
git diff -- <path>
git add -p
```

Safe habits:
- Stage only the files you intend to commit.
- Prefer narrow commits with one purpose.
- Do not use `git reset --hard` or other destructive cleanup unless you explicitly want to discard work.

To see what is already on GitHub:

```powershell
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```

If `HEAD` and `origin/main` differ, local commits have not been pushed yet.
