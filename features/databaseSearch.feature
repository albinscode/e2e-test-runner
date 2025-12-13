Feature: Database Search Operations

  Background:
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    When I execute sql request "DELETE FROM my_table WHERE email NOT IN ('john.doe@example.com', 'jane.smith@example.com', 'bob.johnson@example.com', 'alice.williams@example.com')"

  Scenario: Execute SQL request and verify results
    When I execute sql request "SELECT id, name, email FROM my_table WHERE age > 25"
    Then I expect 3 database results

  Scenario: Search table with filter and verify results count
    When I execute sql request "SELECT id, name, age, email, active FROM my_table WHERE active = true"
    Then I expect 3 database results

  Scenario: Search table and verify specific field values
    When I execute sql request "SELECT id, name, age, email FROM my_table WHERE email = 'alice.williams@example.com'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "Alice Williams"
    And I expect "{{ ctx.dbResults[0].age }}" is "28" as "integer"
    And I expect "{{ ctx.dbResults[0].email }}" is "alice.williams@example.com"

  Scenario: Search all records without filter
    When I execute sql request "SELECT id, name FROM my_table"
    Then I expect 4 database results

  Scenario: Execute SQL request with WHERE clause
    When I execute sql request "SELECT name, active FROM my_table WHERE name LIKE '%Johnson%'"
    Then I expect 1 database results

  Scenario: Search inactive users
    When I execute sql request "SELECT id, name, email, active FROM my_table WHERE active = false"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "Bob Johnson"
    And I expect "{{ ctx.dbResults[0].active }}" is "false" as "boolean"
