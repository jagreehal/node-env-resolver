---
'node-env-resolver-aws': minor
---

# Summary

- Avoid forcing `us-east-1` and let AWS SDK infer the region from the active profile by default.
- Update documentation to clarify that supplying `region` explicitly overrides profile/env configuration.
