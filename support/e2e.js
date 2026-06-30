import './commands';

afterEach(() => {
    cy.task('closeDb', null, { log: false });
});
