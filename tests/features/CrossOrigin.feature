Feature: Cross origin steps

  Scenario: Interact with a cross origin page
    Given I visit the "/index.html"
    When I click on "#cross-origin-link"
    And I set origin url as "{{ env.FRONT_CROSS_ORIGIN_URL }}"
    Then I expect the HTML element "#title" contains "Cross origin page"
    When I click on "#cross-origin-button"
    Then I expect the HTML element "#cross-origin-result" contains "clicked on cross origin"
    When I click on "#home-link"
    And I reset origin url
    Then I expect the HTML element "#title" contains "Page"

  Scenario: Interact with a cross origin page with origin url steps
    Given I visit the "/index.html"
    When I click on "#cross-origin-link"
    Then I expect the HTML element "#title" contains "Cross origin page" with origin url "{{ env.FRONT_CROSS_ORIGIN_URL }}"
    And I expect the HTML element "#cross-origin-input" exists with origin url "{{ env.FRONT_CROSS_ORIGIN_URL }}"
    When I set the text "hello" in the HTML element "#cross-origin-input" with origin url "{{ env.FRONT_CROSS_ORIGIN_URL }}"
    And I click on "#cross-origin-button" with origin url "{{ env.FRONT_CROSS_ORIGIN_URL }}"
    Then I expect the HTML element "#cross-origin-result" contains "clicked on cross origin" with origin url "{{ env.FRONT_CROSS_ORIGIN_URL }}"
