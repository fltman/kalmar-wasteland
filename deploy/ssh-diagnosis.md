# SSH diagnosis — 2026-10-05

The SSH client is `/usr/bin/ssh` (OpenSSH 10.0p2). Effective configuration uses
`root@70.34.197.55`, TCP port 22, direct connection, and the normal identity
files. Existing `id_ed25519` and `id_rsa` files have mode 0600. No private key
contents were inspected.

`ssh -vvv -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes root@70.34.197.55 true`
fails at `ssh_connect_direct`, on the initial `connect()` call, with
`Operation not permitted`. It never reaches key exchange or authentication.

Independent Python TCP socket probes all failed immediately with errno 1,
`EPERM`:

| Destination | Result |
| --- | --- |
| 127.0.0.1:5220 | EPERM |
| 70.34.197.55:22 | EPERM |
| 70.34.197.55:443 | EPERM |
| 1.1.1.1:443 | EPERM |

This session is configured with restricted network access. A read-only SSH test
requested outside the sandbox was rejected before execution by its permission
policy: `sandbox_approval: false`. No remote command ran. The tests establish
the session restriction; they do not establish whether a key is authorized on
the server, whether sshd is listening, or whether the server firewall allows 22.

SSH work requires network access in the agent session. An ordinary local
Terminal can independently test `ssh root@70.34.197.55`; its result would verify
the next connection stages outside this restricted session. No change to keys,
sshd, or firewall is justified by the current evidence.

The user requested SSH as the deployment route. The Vultr-console route has
been stopped. The DNS A record for arena.bjarby.com was saved before that
instruction. No relay installation or server changes have been performed.

## Claude session — 2026-10-05

Network access works in this session. Public DNS (1.1.1.1 and 8.8.8.8) now
resolves `arena.bjarby.com` to 70.34.197.55.

The server's sshd answered. Host keys seen on first contact (TOFU, not verified
out of band; the ED25519 key is now in `~/.ssh/known_hosts`):

| Type | Fingerprint |
| --- | --- |
| ED25519 | `SHA256:tw9A3YXsMCk6Rvk8p/8y21aDaosUSGy8RhJ45EVsRjM` |
| ECDSA | `SHA256:I55shQ1C1fkTsOzQKIZPPngxIXMF8+WUCdnTA592kw8` |
| RSA 3072 | `SHA256:dU9jFk/6lBysfz+aA8k7KfSP1xffgFD5bGoEPwSFJBQ` |

Authentication as `root` failed with `Permission denied (publickey,password)`.
All five local keys were offered and rejected; the agent holds no keys:

| File | Fingerprint |
| --- | --- |
| `id_ed25519` | `SHA256:d2RUTyvWxj2+TnX6gEaU/IOyzdRQKtHPwq3DUr2ZQXI` |
| `id_rsa` | `SHA256:kKJfogWHf6vdTOULBlE/xcrWRmOWN/6Ak6JCapnu6RE` |
| `hooklinecoder_deploy` | `SHA256:WsSKkFrEQgnsOSws8QYGAaMxwWO3Vo5U8O41O6ISTyA` |
| `replit` | `SHA256:/orfXdxAyb63o5XErzmKWlwqpFmA3Lfzc3ApnisD0yM` |
| `fltman-GitHub` | `SHA256:yQhj9QLDXxmDugmoNyJbyT9Id82EUV6HZCfFVCBzM+0` |

So no existing key on this Mac is authorized for root on the server. The server
offers password authentication. No remote command ran and nothing was changed.

**Resolved 2026-10-05:** the user added `id_ed25519.pub` to root's
`authorized_keys` with `ssh-copy-id`, using the Vultr root password. Key login
then worked, and the relay was installed over SSH (see `README.md`).
