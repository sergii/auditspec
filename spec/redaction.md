# Redaction and privacy

Secrets must be removed before audit persistence. Audit storage must never become a secondary secrets database.

Implementations SHOULD distinguish at least:

- credentials and secrets
- personal data
- sensitive business data
- regulated data
- safe identifiers

AuditSpec supports explicit redaction records so a consumer can distinguish a value that was intentionally transformed or omitted from a value that never existed.

```json
{
  "redactions": [
    {
      "path": "/changes/after/api_key",
      "method": "omitted",
      "reason": "credential"
    }
  ]
}
```

Supported core methods are:

- `omitted`
- `redacted`
- `hashed`
- `tokenized`
- `encrypted`

Implementations should maintain explicit deny-lists and type-aware redaction for credentials, API keys, bearer tokens, session cookies, private keys, passwords, and equivalent material.

Redaction must happen before persistence or transmission to a less-trusted audit sink. Hashing does not automatically make sensitive data safe, especially for low-entropy values.
