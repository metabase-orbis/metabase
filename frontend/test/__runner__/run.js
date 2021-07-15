const cypress = require("cypress");
const arg = require("arg");

const args = arg(
  {
    "--folder": String, //
    "--open": [Boolean],
  },
  { permissive: true },
);
const cliArgs = args._;
console.log(cliArgs);

const folder = args["--folder"];
const isOpenMode = args["--open"];
console.log("IS OPEN MODE? " + !!isOpenMode);
console.log("OPEN " + isOpenMode);
console.log("IS FOLDER? " + !!folder);
console.log("FOLDER " + folder);

const isQaDatabase = folder && folder.includes("metabase-db");
// // const isSpecDefined = userArgs.includes("--spec")

const getIgnoreConfig = isQaDatabase => {
  return isQaDatabase ? null : "**/metabase-db/**";
};

const parseArguments = async () => {
  const cliArgs = args._;

  // if (cliArgs[0] !== "run" && !isOpenMode) {
  //   cliArgs.splice(0, 0, "run");
  // }

  // if (cliArgs[0] !== "run" && isOpenMode) {
  //   cliArgs.splice(0, 0, "open");
  // }

  // if (cliArgs[0] === "run" && isOpenMode) {
  //   cliArgs.splice(0, 1, "open");
  // }
  if (cliArgs[0] !== "cypress") {
    cliArgs.unshift("cypress");
  }

  if (cliArgs[1] !== "run") {
    cliArgs.splice(1, 0, "run");
  }
  console.log(cliArgs);

  const parsedArgs = await cypress.cli.parseRunArguments(cliArgs);

  try {
    console.log("PARSED: " + parsedArgs);
  } catch (err) {
    console.error(err);
  }
};

parseArguments();

const getFolderConfig = folder => {
  return folder
    ? {
        spec: `./frontend/test/metabase/scenarios/${folder}/**/*.cy.spec.js`,
      }
    : null;
};

async function runCypress(baseUrl, exitFunction) {
  const defaultConfig = {
    configFile: "frontend/test/__support__/e2e/cypress.json",
    config: {
      baseUrl,
    },
    ignoreTestFiles: getIgnoreConfig(isQaDatabase),
  };
  const userArgs = await cypress.cli.parseRunArguments(cliArgs);

  const specObject = !!folder && getFolderConfig(folder);

  const reporterConfig = process.env["CI"]
    ? {
        reporter: "junit",
        "reporter-options": "mochaFile=cypress/results/results-[hash].xml",
      }
    : null;

  const final = Object.assign(
    {},
    defaultConfig,
    userArgs,
    specObject,
    reporterConfig,
  );

  try {
    const results = isOpenMode
      ? await cypress.open(final)
      : await cypress.run(final);

    console.log("CYPRESS RESULTS");
    console.log(results);

    // At least one test failed.
    if (results.totalFailed > 0) {
      await exitFunction(1);
    }

    // Something went wrong and Cypress failed to even run tests
    if (results.status === "failed" && results.failures) {
      console.error(results.message);

      await exitFunction(results.failures);
    }
  } catch (e) {
    console.error("Unable to generate snapshots\n", e);

    await exitFunction(1);
  }
}

module.exports = runCypress;
