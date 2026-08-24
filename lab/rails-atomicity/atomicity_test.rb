# frozen_string_literal: true

require "active_record"
require "json"
require "minitest/autorun"
require_relative "../../implementations/ruby/lib/auditspec"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: ":memory:")

ActiveRecord::Schema.define do
  create_table :invoices, force: true do |table|
    table.string :status, null: false
  end

  create_table :audit_records, force: true do |table|
    table.string :event_id, null: false
    table.string :action, null: false
    table.string :target_id, null: false
    table.text :payload, null: false
  end
  add_index :audit_records, :event_id, unique: true

  create_table :audit_outbox, force: true do |table|
    table.string :event_id, null: false
    table.text :payload, null: false
  end
  add_index :audit_outbox, :event_id, unique: true
end

class Invoice < ActiveRecord::Base
end

class AuditRecord < ActiveRecord::Base
end

class AuditOutboxRecord < ActiveRecord::Base
  self.table_name = "audit_outbox"
end

class ApproveInvoice
  def self.call(invoice:, event:)
    AuditSpec.validate!(event)

    Invoice.transaction do
      invoice.update!(status: "approved")
      AuditRecord.create!(
        event_id: event.fetch("id"),
        action: event.fetch("action"),
        target_id: event.fetch("targets").first.fetch("id"),
        payload: JSON.generate(event)
      )
    end
  end
end

class ApproveInvoiceWithOutbox
  def self.call(invoice:, event:)
    AuditSpec.validate!(event)

    Invoice.transaction do
      invoice.update!(status: "approved")
      AuditOutboxRecord.create!(
        event_id: event.fetch("id"),
        payload: JSON.generate(event)
      )
    end
  end
end

class RailsAtomicityTest < Minitest::Test
  def setup
    AuditRecord.delete_all
    AuditOutboxRecord.delete_all
    Invoice.delete_all
  end

  def event(id:, invoice:)
    value = JSON.parse(
      File.read(File.join(AuditSpec::ROOT, "schema/examples/user-action.json"))
    )
    value["id"] = id
    value["source"] = "urn:auditspec:rails-atomicity-lab"
    value["action"] = "invoice.approve"
    value["targets"] = [
      { "type" => "invoice", "id" => invoice.id.to_s, "role" => "primary" }
    ]
    value["changes"] = {
      "fields" => ["status"],
      "before" => { "status" => "draft" },
      "after" => { "status" => "approved" }
    }
    value
  end

  def test_business_mutation_and_audit_record_commit_together
    invoice = Invoice.create!(status: "draft")
    value = event(id: "aud_rails_success", invoice: invoice)

    ApproveInvoice.call(invoice: invoice, event: value)

    assert_equal "approved", invoice.reload.status
    record = AuditRecord.find_by!(event_id: value.fetch("id"))
    assert_equal "invoice.approve", record.action
    assert_equal invoice.id.to_s, record.target_id
  end

  def test_audit_persistence_failure_rolls_back_business_mutation
    invoice = Invoice.create!(status: "draft")
    value = event(id: "aud_rails_collision", invoice: invoice)
    AuditRecord.create!(
      event_id: value.fetch("id"),
      action: "existing.event",
      target_id: "existing",
      payload: "{}"
    )

    assert_raises(ActiveRecord::RecordNotUnique) do
      ApproveInvoice.call(invoice: invoice, event: value)
    end

    assert_equal "draft", invoice.reload.status
    assert_equal 1, AuditRecord.where(event_id: value.fetch("id")).count
  end

  def test_outbox_persistence_failure_rolls_back_business_mutation
    invoice = Invoice.create!(status: "draft")
    value = event(id: "aud_rails_outbox_collision", invoice: invoice)
    AuditOutboxRecord.create!(event_id: value.fetch("id"), payload: "{}")

    assert_raises(ActiveRecord::RecordNotUnique) do
      ApproveInvoiceWithOutbox.call(invoice: invoice, event: value)
    end

    assert_equal "draft", invoice.reload.status
    assert_equal 1, AuditOutboxRecord.where(event_id: value.fetch("id")).count
  end

  def test_invalid_audit_event_never_enters_mutation_transaction
    invoice = Invoice.create!(status: "draft")
    value = event(id: "aud_rails_invalid", invoice: invoice)
    value.delete("actor")

    assert_raises(AuditSpec::ValidationError) do
      ApproveInvoice.call(invoice: invoice, event: value)
    end

    assert_equal "draft", invoice.reload.status
    assert_equal 0, AuditRecord.count
  end
end
