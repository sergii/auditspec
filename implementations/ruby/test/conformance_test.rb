# frozen_string_literal: true

require_relative "test_helper"

class ConformanceTest < Minitest::Test
  NON_CORE = {
    "assessment-report" => :assessment,
    "assessment-diff" => :assessment_diff,
    "assurance-graph" => :assurance_graph,
    "assurance-graph-diff" => :assurance_graph_diff,
    "remediation-plan" => :remediation_plan,
    "verification-result" => :verification_result,
    "control-mapping-profile" => :control_mapping_profile,
    "control-mapping-result" => :control_mapping_result,
    "evidence-query-result" => :evidence_query_result,
    "oscal-export-request" => :oscal_export_request,
    "runtime-evidence-record" => :runtime_evidence_record,
    "corroboration-report" => :corroboration_report,
    "corroboration-diff" => :corroboration_diff,
    "corroboration-query-result" => :corroboration_query_result,
    "agent-profile" => :agent_profile
  }.freeze

  CANONICAL = {
    "schema/examples/user-action.json" => :event,
    "schema/examples/agent-action.json" => :event,
    "schema/examples/denied-action.json" => :event,
    "schema/examples/assessment-report.json" => :assessment,
    "schema/examples/assessment-diff.json" => :assessment_diff,
    "schema/examples/assurance-graph.json" => :assurance_graph,
    "schema/examples/assurance-graph-diff.json" => :assurance_graph_diff,
    "schema/examples/remediation-plan.json" => :remediation_plan,
    "schema/examples/verification-result.json" => :verification_result,
    "schema/examples/control-mapping-result.json" => :control_mapping_result,
    "schema/examples/evidence-query-result.json" => :evidence_query_result,
    "schema/examples/oscal-export-request.json" => :oscal_export_request,
    "schema/examples/runtime-evidence-record.json" => :runtime_evidence_record,
    "schema/examples/corroboration-report.json" => :corroboration_report,
    "schema/examples/corroboration-diff.json" => :corroboration_diff,
    "schema/examples/corroboration-query-result.json" => :corroboration_query_result,
    "profiles/agent/examples/tool-call.json" => :agent_profile,
    "mappings/controls/nist-sp800-53-r5.2.0.json" => :control_mapping_profile
  }.freeze

  def test_shared_valid_event_corpus
    fixture_names("conformance/valid").each do |name|
      result = AuditSpec.validate(repo_json("conformance/valid/#{name}"))
      assert_equal true, result.fetch("valid"), "#{name}: #{result.fetch("errors").inspect}"
    end
  end

  def test_shared_invalid_event_corpus
    fixture_names("conformance/invalid").each do |name|
      result = AuditSpec.validate(repo_json("conformance/invalid/#{name}"))
      assert_equal false, result.fetch("valid"), "#{name} unexpectedly validated"
    end
  end

  def test_shared_non_core_negative_corpus
    NON_CORE.each do |directory, contract|
      fixture_names("conformance/invalid/#{directory}").each do |name|
        result = AuditSpec.validate(
          repo_json("conformance/invalid/#{directory}/#{name}"),
          contract: contract
        )
        assert_equal false, result.fetch("valid"), "#{directory}/#{name} unexpectedly validated"
      end
    end
  end

  def test_canonical_examples
    CANONICAL.each do |path, contract|
      result = AuditSpec.validate(repo_json(path), contract: contract)
      assert_equal true, result.fetch("valid"), "#{path}: #{result.fetch("errors").inspect}"
    end
  end

  def test_validate_bang_preserves_valid_input_and_raises_with_issues_for_invalid_input
    valid = repo_json("schema/examples/user-action.json")
    assert_same valid, AuditSpec.validate!(valid)

    error = assert_raises(AuditSpec::ValidationError) do
      AuditSpec.validate!(repo_json("conformance/invalid/missing-actor.json"))
    end
    refute_empty error.issues
  end
end
