# Debian Package

Build `.deb` as a wrapper around the published npm package.

Expected install behavior:

```bash
sudo apt-get install flatkey
flatkey help --ai
```

Package contents:

- Node runtime dependency.
- Global install of `@flatkey-ai/cli`.
- `/usr/bin/flatkey` launcher.
