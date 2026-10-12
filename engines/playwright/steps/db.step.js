const { expect } = require('@playwright/test');
const { Given, Then, When } = require('../fixtures');
const { render } = require('../../../core/utils');

Given('I setup database with {string}', async ({ db, world }, templatedConnectionString) => {
    db.initDb({ connectionString: render(templatedConnectionString, world) });
});

Given('I setup database with driver {string} host {string} port {int} user {string} password {string} database {string}',
    async ({ db, world }, templatedDriver, templatedHost, port, templatedUser, templatedPassword, templatedDatabase) => {
        db.initDb({
            driver: render(templatedDriver, world),
            host: render(templatedHost, world),
            port,
            user: render(templatedUser, world),
            password: render(templatedPassword, world),
            database: render(templatedDatabase, world),
        });
    });

When('I execute sql request {string}', async ({ db, world }, templatedSqlRequest) => {
    await db.runDbRequest({ sqlRequest: render(templatedSqlRequest, world) });
    world.ctx.dbResults = db.getDbResults();
});

When('I execute sql request {string} with values:', async ({ db, world }, templatedSqlRequest, valuesJson) => {
    const sqlRequest = render(templatedSqlRequest, world);
    const values = JSON.parse(render(valuesJson, world));

    await db.runDbRequest({ sqlRequest, values });
    world.ctx.dbResults = db.getDbResults();
});

Then('I expect {int} database results', async ({ db }, expected) => {
    expect(db.getDbResults().length).toBe(expected);
});

Given('I setup database with connection string {string}', async ({ db, world }, templatedConnectionString) => {
    await db.initDb({ connectionString: render(templatedConnectionString, world) });
});

When('I search db table {string} with filter {string} and columns {string}', async ({ db, world }, templatedTable, templatedFilter, templatedColumns) => {
    await db.runDbSearch({
        table: render(templatedTable, world),
        filter: render(templatedFilter, world),
        columns: render(templatedColumns, world),
    });
});

When('I add a row to table {string} with values:', async ({ db, world }, templatedTableName, rowJson) => {
    await db.addTableRow({
        tableName: render(templatedTableName, world),
        rowData: JSON.parse(rowJson),
    });
});

Then('I expect {int} db results', async ({ db }, expected) => {
    expect(db.getDbResults().length).toBe(expected);
});

Then('I delete all db results', async ({ db }) => {
    await db.deleteDbResults();
});
