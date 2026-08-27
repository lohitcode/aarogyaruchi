# Secrets (SOPS + age)

These `.env` files are **encrypted** (SOPS/age) and safe to commit. Each is
readable only by the corresponding server's age key:

- `prod.env` → decrypts on the prod VPS (`ssh server`, key at
  `~/.config/sops/age/keys.txt`, `sops` at `/usr/local/bin/sops`)
- `dev.env` → decrypts on the dev box (`ssh dev-server`, key at
  `~/.config/sops/age/keys.txt`, `sops` at `~/.local/bin/sops`)

The operator's Mac holds backup copies of both private keys in
`~/.sops/age/{prod,dev}.key` (recover them if a server is rebuilt).

## Workflow

```bash
# edit / rotate any value (Mac needs SOPS_AGE_KEY_FILE or ~/.sops/age/keys.txt)
SOPS_AGE_KEY_FILE=~/.sops/age/prod.key sops server/secrets/prod.env
git commit -am "secrets: rotate X" && git push

# the next ./deploy.sh hydrates /app/.env on the box from this file
```

Plaintext never lands on disk here — decrypt straight to the deploy target:
`sops -d --output <dest> <file>`. Scratch files must use a `.dec` suffix
(gitignored). `BASIC_AUTH_PASSWORD` (the Caddy gate for the db/cache UIs)
lives in these files — the Caddyfiles carry only its bcrypt hash.
