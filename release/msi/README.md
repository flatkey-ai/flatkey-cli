# Windows MSI

Build MSI as a wrapper around the published npm package.

Expected install behavior:

```powershell
flatkey help --ai
```

Package contents:

- Node runtime prerequisite or bundled runtime.
- Install of `@flatkey-ai/cli`.
- `flatkey.cmd` on PATH.
