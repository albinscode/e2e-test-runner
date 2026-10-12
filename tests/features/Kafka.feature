Feature: Kafka steps

  Scenario: Send and receive messages
    Given I setup kafka with clientId "e2e-test-runner" and broker "{{ env.KAFKA_BROKER }}"
    And I setup kafka producer
    When I send a Kafka message on the topic "{{ env.KAFKA_TOPIC }}" with body "{\"id\": 1, \"name\": \"John\"}"
    And I send a Kafka message on the topic "{{ env.KAFKA_TOPIC }}" with body:
      """
      {"id": 2, "name": "Jane"}
      """
    Given I setup kafka consumer with groupId "{{ env.KAFKA_TOPIC }}-group"
    And I listen for Kafka messages on the topic "{{ env.KAFKA_TOPIC }}"
    When I wait 10s
    Then I expect 2 messages received on Kafka topic "{{ env.KAFKA_TOPIC }}"
    And I expect a message on Kafka topic "{{ env.KAFKA_TOPIC }}" equals to "{\"id\":1,\"name\":\"John\"}"
    And I expect a message on Kafka topic "{{ env.KAFKA_TOPIC }}" equals to "{\"name\": \"Jane\", \"id\": 2}" as "json"
    And I expect a message on Kafka topic "{{ env.KAFKA_TOPIC }}" equals to:
      """
      {"id":2,"name":"Jane"}
      """
    And I expect a message on Kafka topic "{{ env.KAFKA_TOPIC }}" contains "John"
    And I expect a message on Kafka topic "{{ env.KAFKA_TOPIC }}" contains:
      """
      "name":"Jane"
      """
    And I expect a message on Kafka topic "{{ env.KAFKA_TOPIC }}" matches regex "\"id\":\d"
    And I log kafka messages

  Scenario: Send and receive messages in Confluent wire format, matched by correlation id
    Given I setup kafka with clientId "e2e-test-runner" and broker "{{ env.KAFKA_BROKER }}" and oauthClientId "" and oauthClientSecret "" and oauthScope "" and oauthEndpoint "" and trustStorePath "" and trustStorePassword ""
    And I enable Confluent wire format with schema id 1
    And I setup kafka producer
    # Creates the topic: the consumer only receives messages sent after it subscribed.
    And I send a Kafka message on the topic "{{ env.KAFKA_TOPIC }}-confluent" with body "{}"
    And I setup kafka consumer with groupId "{{ env.KAFKA_TOPIC }}-confluent-group"
    And I listen for new Kafka messages on the topic "{{ env.KAFKA_TOPIC }}-confluent"
    When I send a Kafka message on the topic "{{ env.KAFKA_TOPIC }}-confluent" with body "{\"payload\": \"eyJoZWFkZXIiOnsiY29ycmVsYXRpb25faWQiOiJlMmUtY29ycmVsYXRpb24ifSwiYm9keSI6IkjDqWzDqG5lIn0=\"}"
    And I wait 10s
    Then I store message from Kafka topic "{{ env.KAFKA_TOPIC }}-confluent" with base64 payload matching correlation id "e2e-correlation" as JSON "message" in context
    And I decode base64 string "{{ ctx.message.payload }}" and store it as JSON "decoded" in context
    And I expect "{{ ctx.decoded.body }}" is "Hélène"
