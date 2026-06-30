import '@4tw/cypress-drag-drop';
import './commands';

afterEach(() => {
    cy.task('closeDb', null, { log: false });
});
