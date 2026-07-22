# Example workflow

From a repository initialized with TerseForge:

```bash
terseforge doctor
terseforge map
terseforge context "refresh token validation" --symbol validateToken --budget 800
terseforge exec -- npm test
terseforge check
terseforge stats
terseforge handoff "Complete refresh-token validation"
```

If the compact output omits context required to diagnose a failure, retrieve it exactly:

```bash
terseforge output <run-id>
terseforge output <run-id> --lines 100:180
```
