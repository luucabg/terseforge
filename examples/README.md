# Example workflow

Install the skill once for your agent:

```bash
terseforge skill install --agent codex
```

Then open a repository in a new agent session and say:

```text
Activa TerseForge en este proyecto.
```

The equivalent explicit workflow is:

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
