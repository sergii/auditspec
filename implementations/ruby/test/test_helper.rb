# frozen_string_literal: true

require "json"
require "minitest/autorun"
require_relative "../lib/auditspec"

module AuditSpecTestHelpers
  def repo_json(relative_path)
    JSON.parse(File.read(File.join(AuditSpec::ROOT, relative_path)))
  end

  def fixture_names(relative_directory)
    Dir[File.join(AuditSpec::ROOT, relative_directory, "*.json")].sort.map { |path| File.basename(path) }
  end
end

class Minitest::Test
  include AuditSpecTestHelpers
end
