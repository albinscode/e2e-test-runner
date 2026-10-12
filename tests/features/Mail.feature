Feature: Mail steps

  Background:
    Given I setup mailpit with url "{{ env.MAILPIT_URL }}"
    And I delete all mails sent to "jane@example.com"
    And I set http header "Content-Type" with "application/json"
    When I request "{{ env.MAILPIT_URL }}/api/v1/send" with method "POST" with body:
      """
      {
        "From": {"Email": "noreply@example.com"},
        "To": [{"Email": "jane@example.com"}],
        "Subject": "Réinitialisation de votre mot de passe",
        "Text": "Bonjour Hélène, réinitialisez votre mot de passe : https://example.com/reset?token=e2e",
        "HTML": "<p>Bonjour Hélène, <a href=\"https://example.com/reset?token=e2e\">réinitialisez votre mot de passe</a></p>"
      }
      """
    Then I expect status code is 200

  Scenario: Read the last mail sent to a recipient
    Then I expect 1 mail sent to "jane@example.com"
    When I get the last mail sent to "jane@example.com"
    Then I expect the mail subject is "Réinitialisation de votre mot de passe"
    And I expect the mail contains "Bonjour Hélène"
    And I expect the mail is correctly encoded in UTF-8
    And I store the mail link containing "token=" as "resetLink" in context
    And I expect "{{ ctx.resetLink }}" is "https://example.com/reset?token=e2e"

  Scenario: Read the last mail sent to a recipient with a subject
    When I get the last mail sent to "jane@example.com" with subject "Réinitialisation"
    Then I expect "{{ mail.To[0].Address }}" is "jane@example.com"
    When I delete all mails sent to "jane@example.com"
    Then I expect 0 mails sent to "jane@example.com"
