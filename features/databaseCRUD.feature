Feature: Database CRUD Operations

  Background:
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    When I execute sql request "DELETE FROM my_table WHERE email NOT IN ('john.doe@example.com', 'jane.smith@example.com', 'bob.johnson@example.com', 'alice.williams@example.com')"

  Scenario: Insert a single record
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ('Test User', 40, 'test@example.com', true)"
    And I execute sql request "SELECT id, name, age, email, active FROM my_table WHERE email = 'test@example.com'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "Test User"
    And I expect "{{ ctx.dbResults[0].age }}" is "40" as "integer"

  Scenario: Update an existing record
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ('Update Test', 30, 'update@example.com', true)"
    And I execute sql request "UPDATE my_table SET age = 35, name = 'Updated User' WHERE email = 'update@example.com'"
    And I execute sql request "SELECT name, age FROM my_table WHERE email = 'update@example.com'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "Updated User"
    And I expect "{{ ctx.dbResults[0].age }}" is "35" as "integer"

  Scenario: Delete a record
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ('Delete Me', 25, 'delete@example.com', false)"
    And I execute sql request "SELECT COUNT(*) as count FROM my_table WHERE email = 'delete@example.com'"
    Then I expect 1 database results
    When I execute sql request "DELETE FROM my_table WHERE email = 'delete@example.com'"
    And I execute sql request "SELECT COUNT(*) as count FROM my_table WHERE email = 'delete@example.com'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].count }}" is "0" as "integer"

  Scenario: Insert with special characters in strings
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ('O''Brien', 45, 'obrien@example.com', true)"
    And I execute sql request "SELECT name FROM my_table WHERE email = 'obrien@example.com'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "O'Brien"

  Scenario: Insert multiple records and verify count
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ('Multi 1', 30, 'multi1@example.com', true), ('Multi 2', 35, 'multi2@example.com', true), ('Multi 3', 40, 'multi3@example.com', false)"
    And I execute sql request "SELECT COUNT(*) as count FROM my_table WHERE email LIKE 'multi%'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].count }}" is "3" as "integer"

  Scenario: Update multiple records
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ('Batch 1', 20, 'batch1@example.com', false), ('Batch 2', 21, 'batch2@example.com', false)"
    And I execute sql request "UPDATE my_table SET active = true WHERE email LIKE 'batch%'"
    And I execute sql request "SELECT COUNT(*) as count FROM my_table WHERE email LIKE 'batch%' AND active = true"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].count }}" is "2" as "integer"
