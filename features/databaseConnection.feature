Feature: Database Connection Testing

  Scenario: Connect to database using connection string
    Given I setup database with "{{ env.DB_CONNECTION_STRING }}"
    When I execute sql request "SELECT id, name, email FROM my_table WHERE name = 'John Doe'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "John Doe"

  Scenario: Connect to database using individual parameters
    Given I setup database with driver "{{ env.DB_DRIVER }}" host "{{ env.DB_HOST }}" port 5432 user "{{ env.DB_USER }}" password "{{ env.DB_PASSWORD }}" database "{{ env.DB_NAME }}"
    When I execute sql request "SELECT id, name, age, email FROM my_table WHERE name = 'Jane Smith'"
    Then I expect 1 database results
    And I expect "{{ ctx.dbResults[0].name }}" is "Jane Smith"
    And I expect "{{ ctx.dbResults[0].age }}" is "25" as "integer"
