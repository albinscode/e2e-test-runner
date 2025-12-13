Feature: Database Parameterized Queries

  Scenario: Insert with values from context using placeholders
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    And I store "testName" as "Test's User" in context
    And I store "testEmail" as "test@example.com" in context
    And I store "testAge" as "40" in context
    When I execute sql request "DELETE FROM my_table WHERE email = $1" with values:
    """
    ["{{ ctx.testEmail }}"]
    """
    And I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ($1, $2, $3, $4)" with values:
    """
    ["{{ ctx.testName }}", {{ ctx.testAge }}, "{{ ctx.testEmail }}", true]
    """
    And I execute sql request "SELECT name FROM my_table WHERE email = $1" with values:
    """
    ["{{ ctx.testEmail }}"]
    """
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "{{ ctx.testName }}"

  Scenario: Insert with SQL injection attempt (should be safe with placeholders)
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    And I store "maliciousName" as "'; DROP TABLE my_table; --" in context
    When I execute sql request "DELETE FROM my_table WHERE email = $1" with values:
    """
    ["hacker@example.com"]
    """
    And I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ($1, $2, $3, $4)" with values:
    """
    ["{{ ctx.maliciousName }}", 99, "hacker@example.com", true]
    """
    And I execute sql request "SELECT name FROM my_table WHERE email = $1" with values:
    """
    ["hacker@example.com"]
    """
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "{{ ctx.maliciousName }}"

  Scenario: Update with parameterized values
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    And I store "originalEmail" as "param@example.com" in context
    And I store "newAge" as "50" in context
    When I execute sql request "DELETE FROM my_table WHERE email = $1" with values:
    """
    ["{{ ctx.originalEmail }}"]
    """
    And I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ($1, $2, $3, $4)" with values:
    """
    ["Param Test", 30, "{{ ctx.originalEmail }}", true]
    """
    And I execute sql request "UPDATE my_table SET age = $1 WHERE email = $2" with values:
    """
    [{{ ctx.newAge }}, "{{ ctx.originalEmail }}"]
    """
    And I execute sql request "SELECT age FROM my_table WHERE email = $1" with values:
    """
    ["{{ ctx.originalEmail }}"]
    """
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].age }}" is "{{ ctx.newAge }}" as "integer"

  Scenario: Delete with parameterized values
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    And I store "deleteEmail" as "to-delete@example.com" in context
    When I execute sql request "INSERT INTO my_table (name, age, email, active) VALUES ($1, $2, $3, $4)" with values:
    """
    ["Delete User", 25, "{{ ctx.deleteEmail }}", false]
    """
    And I execute sql request "DELETE FROM my_table WHERE email = $1" with values:
    """
    ["{{ ctx.deleteEmail }}"]
    """
    And I execute sql request "SELECT COUNT(*) as count FROM my_table WHERE email = $1" with values:
    """
    ["{{ ctx.deleteEmail }}"]
    """
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].count }}" is "0" as "integer"
