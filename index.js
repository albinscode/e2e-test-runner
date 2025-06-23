const cypress = require('cypress');

cypress.run().then((results) => {
  if (results.totalFailed) {
    console.error("Some tests failed");
    throw new Error(`Cypress tests failed: ${results.totalFailed} tests failed.`);
  } else {
    console.error("All tests are OK");
  }
}).catch((err) => {
  console.error('Cypress failed to run:', err);
  process.exit(1);
});
