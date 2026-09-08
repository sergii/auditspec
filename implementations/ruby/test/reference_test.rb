# frozen_string_literal: true

require_relative "test_helper"

class ReferenceTest < Minitest::Test
  def event
    repo_json("conformance/valid/agent-action.json")
  end

  def test_normalization_is_deterministic_and_idempotent
    value = event.merge(
      "metadata" => {
        "z" => 1,
        "a" => { "y" => 2, "b" => 3 }
      }
    )

    normalized = AuditSpec.normalize(value)
    assert_equal %w[a z], normalized.fetch("metadata").keys
    assert_equal %w[b y], normalized.fetch("metadata").fetch("a").keys
    assert_equal normalized, AuditSpec.normalize(normalized)
    assert_equal %w[z a], value.fetch("metadata").keys
  end

  def test_redaction_is_secret_safe_and_idempotent
    value = event.merge(
      "metadata" => {
        "token" => "metadata-secret",
        "nested" => {
          "password" => "nested-secret",
          "safe" => "visible"
        }
      }
    )

    once = AuditSpec.redact(value)
    twice = AuditSpec.redact(once)

    assert_equal "[REDACTED]", once.fetch("metadata").fetch("token")
    assert_equal "[REDACTED]", once.fetch("metadata").fetch("nested").fetch("password")
    assert_equal "visible", once.fetch("metadata").fetch("nested").fetch("safe")
    assert_equal once, twice
    assert_equal 2, once.fetch("redactions").count { |item| item.fetch("reason") == "sensitive_data" }
    assert_equal true, AuditSpec.validate(once).fetch("valid")
    assert_equal "metadata-secret", value.fetch("metadata").fetch("token")
  end

  def test_explicit_json_pointer_path_uses_rfc6901_escaping
    value = event.merge("metadata" => { "credential/with~separator" => "secret" })
    path = "/metadata/credential~1with~0separator"

    redacted = AuditSpec.redact(value, keys: [], paths: [path])

    assert_equal "[REDACTED]", redacted.fetch("metadata").fetch("credential/with~separator")
    assert_equal path, redacted.fetch("redactions").first.fetch("path")
  end

  def test_delivery_deduplicates_identical_retry
    store = AuditSpec::Deduplicator.new
    value = event.merge("idempotency_key" => "invoice:INV-0042:approve")

    assert_equal "accepted", store.accept(value).fetch("status")
    assert_equal "duplicate", store.accept(JSON.parse(JSON.generate(value))).fetch("status")
    assert_equal 1, store.size
    assert_equal "#{value.fetch("source")}\0#{value.fetch("id")}", AuditSpec.event_identity(value)
  end

  def test_delivery_rejects_same_identity_with_different_payload
    store = AuditSpec::Deduplicator.new
    store.accept(event)
    conflicting = event.merge("result" => { "status" => "failed", "code" => "db_error" })

    assert_raises(AuditSpec::IdentityConflictError) { store.accept(conflicting) }
    assert_equal 1, store.size
  end

  def test_idempotency_key_cannot_silently_map_to_two_event_ids
    store = AuditSpec::Deduplicator.new
    first = event.merge("id" => "aud_ruby_1", "idempotency_key" => "same-operation")
    second = event.merge("id" => "aud_ruby_2", "idempotency_key" => "same-operation")

    store.accept(first)
    assert_raises(AuditSpec::IdentityConflictError) { store.accept(second) }
    assert_equal 1, store.size
  end

  def test_same_id_under_different_source_is_a_distinct_identity
    store = AuditSpec::Deduplicator.new
    first = event.merge("source" => "urn:example:ruby-a")
    second = event.merge("source" => "urn:example:ruby-b")

    assert_equal "accepted", store.accept(first).fetch("status")
    assert_equal "accepted", store.accept(second).fetch("status")
    assert_equal 2, store.size
  end

  def test_emitter_validates_before_calling_sink
    emitted = []
    emitter = AuditSpec::Emitter.new(->(value) { emitted << value; :stored })

    assert_equal :stored, emitter.emit(event)
    assert_equal [event], emitted

    invalid = event.reject { |key, _value| key == "actor" }
    assert_raises(AuditSpec::ValidationError) { emitter.emit(invalid) }
    assert_equal [event], emitted
  end
end
