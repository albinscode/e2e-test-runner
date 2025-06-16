import {Given, Then, When} from "@badeball/cypress-cucumber-preprocessor";
import {render} from "./utils";

When('I click on {string} with origin url {string}', (templatedSelector, templatedUrlOrigin) => {
    cy.getContext().then((context) => {
        const selector = render(templatedSelector, context);
        const urlOrigin = render(templatedUrlOrigin, context);

        return cy.origin(urlOrigin, { args: { selector } }, ({selector}) => {
            cy.get(selector).click();
        });
    });
});

Then('I expect the HTML element {string} exists with origin url {string}', (templatedSelector, templatedUrlOrigin) => {
    cy.getContext().then((context) => {
        const selector = render(templatedSelector, context);
        const urlOrigin = render(templatedUrlOrigin, context);

        return cy.origin(urlOrigin, { args: { selector } }, ({selector}) => {
            cy.get(selector).should('exist');
        });
    });
});


Then('I set the text {string} in the HTML element {string} with origin url {string}', (value, templatedSelector, templatedUrlOrigin) => {
    cy.getContext().then((context) => {
        const selector = render(templatedSelector, context);
        const urlOrigin = render(templatedUrlOrigin, context);
        return cy.origin(urlOrigin, { args: { selector, value } }, ({selector, value}) => {
            cy.get(selector).clear().type(value);
        });
    });
});

Given('I set the viewport size to {int} px by {int} px', (width, height) => {
    cy.viewport(parseInt(width, 10), parseInt(height, 10));
});
