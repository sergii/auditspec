# Redaction

Secrets must be removed before audit persistence.

Implementations should maintain explicit deny-lists and type-aware redaction for credentials, API keys, tokens, session cookies, private keys, passwords, and sensitive payloads. Audit storage must never become a secondary secrets database.
