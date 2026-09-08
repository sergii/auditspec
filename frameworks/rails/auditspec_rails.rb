# frozen_string_literal: true

require_relative "../../implementations/ruby/lib/auditspec"

module AuditSpec
  module Rails
    class Adapter
      def initialize(insert_event:, insert_outbox:, after_commit: nil, wake_publisher: nil)
        @insert_event = insert_event
        @insert_outbox = insert_outbox
        @after_commit = after_commit
        @wake_publisher = wake_publisher
      end

      def emit_same_store(event)
        AuditSpec.validate!(event)
        @insert_event.call(AuditSpec.normalize(event))
      end

      def stage_outbox(event)
        AuditSpec.validate!(event)
        identity = AuditSpec.event_identity(event)
        result = @insert_outbox.call(identity, AuditSpec.normalize(event))

        if @after_commit && @wake_publisher
          @after_commit.call(-> { @wake_publisher.call(identity) })
        end

        result
      end
    end

    def self.active_record_after_commit(active_record)
      lambda do |callback|
        active_record.after_all_transactions_commit(&callback)
      end
    end
  end
end
