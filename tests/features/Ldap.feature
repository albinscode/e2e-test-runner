Feature: LDAP steps

  Scenario: Add, search and delete entries
    Given I setup ldap with url "{{ env.LDAP_URL }}" bind dn "{{ env.LDAP_BIND_DN }}" and password "{{ env.LDAP_PASSWORD }}"
    When I add a ldap entry with dn "cn=john,{{ env.LDAP_BASE_DN }}" and with attributes:
      """
      {"cn": "john", "sn": "e2e", "objectClass": ["person"]}
      """
    And I add a ldap entry with dn "cn=jane,{{ env.LDAP_BASE_DN }}" and with attributes "{\"cn\": \"jane\", \"sn\": \"e2e\", \"objectClass\": [\"person\"]}"
    And I search ldap results on base dn "{{ env.LDAP_BASE_DN }}" with filter "(sn=e2e)" and attributes "cn sn"
    Then I expect 2 ldap results
    When I delete all ldap results
    And I search ldap results on base dn "{{ env.LDAP_BASE_DN }}" with filter "(sn=e2e)" and attributes "cn"
    Then I expect 0 ldap results

  Scenario: Modify an entry and store results in context
    Given I setup ldap with url "{{ env.LDAP_URL }}" bind dn "{{ env.LDAP_BIND_DN }}" and password "{{ env.LDAP_PASSWORD }}"
    When I add a ldap entry with dn "cn=jim,{{ env.LDAP_BASE_DN }}" and with attributes:
      """
      {"cn": "jim", "sn": "e2e-modify", "description": "initial", "objectClass": ["person"]}
      """
    And I modify ldap entry "cn=jim,{{ env.LDAP_BASE_DN }}" and replace attribute "description" with value "modified"
    And I search ldap results on base dn "{{ env.LDAP_BASE_DN }}" with filter "(sn=e2e-modify)" and attributes "cn description"
    Then I expect 1 ldap results
    And I store ldap results as "jim" in context
    And I expect "{{ ctx.jim[0].description }}" is "modified"
    When I delete all ldap results
