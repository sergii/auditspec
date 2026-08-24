# frozen_string_literal: true

require "json"
require "json_schemer"

module AuditSpec
  ROOT = File.expand_path("../../..", __dir__)

  SCHEMAS = {
    event: "schema/audit-event.schema.json",
    assessment: "schema/assessment-report.schema.json",
    assessment_diff: "schema/assessment-diff.schema.json",
    assurance_graph: "schema/assurance-graph.schema.json",
    assurance_graph_diff: "schema/assurance-graph-diff.schema.json",
    remediation_plan: "schema/remediation-plan.schema.json",
    verification_result: "schema/verification-result.schema.json",
    control_mapping_profile: "schema/control-mapping-profile.schema.json",
    control_mapping_result: "schema/control-mapping-result.schema.json",
    evidence_query_result: "schema/evidence-query-result.schema.json",
    oscal_export_request: "schema/oscal-export-request.schema.json",
    runtime_evidence_record: "schema/runtime-evidence-record.schema.json",
    corroboration_report: "schema/corroboration-report.schema.json",
    corroboration_diff: "schema/corroboration-diff.schema.json",
    agent_profile: "profiles/agent/agent-profile.schema.json"
  }.freeze

  DEFAULT_SECRET_KEYS = %w[
    password
    secret
    token
    api_key
    access_token
    refresh_token
    session_cookie
    private_key
  ].freeze

  class ValidationError < StandardError
    attr_reader :issues

    def initialize(message, issues)
      super(message)
      @issues = issues
    end
  end

  class IdentityConflictError < StandardError; end

  class << self
    def validate(input, contract: :event)
      errors = schemer(contract).validate(input).map do |error|
        {
          "data_pointer" => error["data_pointer"],
          "schema_pointer" => error["schema_pointer"],
          "type" => error["type"],
          "error" => error["error"]
        }
      end

      { "valid" => errors.empty?, "errors" => errors }
    end

    def validate!(input, contract: :event)
      result = validate(input, contract: contract)
      return input if result.fetch("valid")

      raise ValidationError.new("Invalid AuditSpec #{contract}", result.fetch("errors"))
    end

    def normalize(value)
      case value
      when Array
        value.map { |child| normalize(child) }
      when Hash
        value.keys.map(&:to_s).sort.each_with_object({}) do |key, result|
          original_key = value.key?(key) ? key : value.keys.find { |candidate| candidate.to_s == key }
          result[key] = normalize(value.fetch(original_key))
        end
      else
        value
      end
    end

    def redact(event, keys: DEFAULT_SECRET_KEYS, paths: [], method: "redacted", reason: "sensitive_data", replacement: "[REDACTED]")
      clone = JSON.parse(JSON.generate(event))
      normalized_keys = keys.map(&:downcase).to_h { |key| [key, true] }
      explicit_paths = paths.to_h { |path| [path, true] }
      existing = clone.delete("redactions") || []
      additions = []

      visit = lambda do |value, path|
        case value
        when Array
          value.each_with_index { |child, index| visit.call(child, "#{path}/#{index}") }
        when Hash
          value.keys.each do |key|
            child_path = "#{path}/#{pointer_segment(key)}"
            matches = normalized_keys.key?(key.downcase) || explicit_paths.key?(child_path)

            if matches
              if method == "omitted"
                value.delete(key)
              else
                value[key] = replacement
              end
              additions << { "path" => child_path, "method" => method, "reason" => reason }
            else
              visit.call(value[key], child_path)
            end
          end
        end
      end

      visit.call(clone, "")
      redactions = unique_redactions(existing + additions)
      clone["redactions"] = redactions unless redactions.empty?
      clone
    end

    def event_identity(event)
      validate!(event)
      "#{event.fetch("source")}\0#{event.fetch("id")}" 
    end

    private

    def schemer(contract)
      @schemers ||= {}
      @schemers[contract] ||= begin
        relative_path = SCHEMAS.fetch(contract) { raise ArgumentError, "Unknown AuditSpec contract: #{contract}" }
        schema = JSON.parse(File.read(File.join(ROOT, relative_path)))
        JSONSchemer.schema(schema, format: true)
      end
    end

    def pointer_segment(value)
      value.to_s.gsub("~", "~0").gsub("/", "~1")
    end

    def unique_redactions(values)
      seen = {}
      values.each_with_object([]) do |redaction, result|
        identity = [redaction["path"], redaction["method"], redaction["reason"]]
        next if seen.key?(identity)

        seen[identity] = true
        result << redaction
      end
    end
  end

  class Deduplicator
    def initialize
      @events = {}
      @idempotency_keys = {}
    end

    def accept(event)
      AuditSpec.validate!(event)
      identity = AuditSpec.event_identity(event)
      payload = JSON.generate(AuditSpec.normalize(event))

      if @events.key?(identity)
        unless @events.fetch(identity) == payload
          raise IdentityConflictError, "AuditSpec identity collision for source + id"
        end

        return { "status" => "duplicate", "identity" => identity }
      end

      idempotency_key = event["idempotency_key"]
      if idempotency_key
        idempotency_identity = "#{event.fetch("source")}\0#{idempotency_key}"
        previous_identity = @idempotency_keys[idempotency_identity]
        if previous_identity && previous_identity != identity
          raise IdentityConflictError, "AuditSpec idempotency_key collision"
        end
        @idempotency_keys[idempotency_identity] = identity
      end

      @events[identity] = payload
      { "status" => "accepted", "identity" => identity }
    end

    def size
      @events.size
    end
  end

  class Emitter
    def initialize(sink)
      @sink = sink
    end

    def emit(event)
      AuditSpec.validate!(event)
      @sink.call(event)
    end
  end
end
