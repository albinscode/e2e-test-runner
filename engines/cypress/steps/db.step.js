import { Given, When, Then } from "@badeball/cypress-cucumber-preprocessor";
import { render } from "../../../core/utils";

afterEach(() => {
    cy.task('clearDb');
});

Given("I setup database with {string}", (templatedConnectionString) => {
      return cy.getContext().then(ctx => {
          const connectionString = render(templatedConnectionString, ctx);
          return cy.task("initDb", { connectionString });
      });
  }
);

Given("I setup database with driver {string} host {string} port {int} user {string} password {string} database {string}",
        (templatedDriver, templatedHost, port, templatedUser, templatedPassword, templatedDatabase) => {
      return cy.getContext().then(ctx => {
          const driver = render(templatedDriver, ctx);
          const host = render(templatedHost, ctx);
          const user = render(templatedUser, ctx);
          const password = render(templatedPassword, ctx);
          const database = render(templatedDatabase, ctx);
          return cy.task("initDb", { driver, host, port, user, password, database });
      });
  }
);

When("I execute sql request {string}", (templatedSqlRequest) => {
    return cy.getContext().then(context => {
        const sqlRequest = render(templatedSqlRequest, context);
        return cy.task("runDbRequest", { sqlRequest }).then(() => {
            return cy.task("getDbResults").then(results => {
                const {ctx} = context;
                ctx.dbResults = results;
                return cy.setContext({ctx});
            });
        });
    });
  }
);

When("I execute sql request {string} with values:", (templatedSqlRequest, valuesJson) => {
    return cy.getContext().then(context => {
        const sqlRequest = render(templatedSqlRequest, context);
        const renderedJson = render(valuesJson, context);
        const values = JSON.parse(renderedJson);

        return cy.task("runDbRequest", { sqlRequest, values }).then(() => {
            return cy.task("getDbResults").then(results => {
                const {ctx} = context;
                ctx.dbResults = results;
                return cy.setContext({ctx});
            });
        });
    });
  }
);

Then("I expect {int} database results", expected => {
    return cy.task("getDbResults").then(rows => {
        expect(rows.length).to.equal(expected);
    });
});

// Table helpers (from feature/url-origin)

Given("I setup database with connection string {string}", (templatedConnectionString) => {
      return cy.getContext().then(ctx => {
          const connectionString = render(templatedConnectionString, ctx);
          return cy.task("initDb", { connectionString });
      });
  }
);

When("I search db table {string} with filter {string} and columns {string}", (templatedTable, templatedFilter, templatedColumns) => {
    return cy.getContext().then(ctx => {
        const table = render(templatedTable, ctx);
        const filter = render(templatedFilter, ctx);
        const columns = render(templatedColumns, ctx);
        return cy.task("runDbSearch", { table, filter, columns });
    });
  }
);

When('I add a row to table {string} with values:',
    (templatedTableName, rowJson) => {
        return cy.getContext().then(context => {
            const tableName   = render(templatedTableName, context);
            const rowData     = JSON.parse(rowJson);

            return cy.task('addTableRow', { tableName, rowData });
        });
    }
);

Then("I expect {int} db results", expected => {
    return cy.task("getDbResults").then(rows => {
        expect(rows.length).to.equal(expected);
    });
});

Then("I delete all db results", () => {
    return cy.task("deleteDbResults");
});
