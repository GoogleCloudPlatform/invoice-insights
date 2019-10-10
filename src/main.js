/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import yargs from "yargs";
import chalk from "chalk";
import { parseCSV } from "./aws/InvoiceParser";
import { printSummary } from "./reports/SummaryReport";
import { printInstances } from "./reports/InstanceReport";
import { printStorage } from "./reports/StorageReport";
import { printSQL } from "./reports/SqlReport";
import { printCache } from "./reports/CacheReport";
import { setOptions } from "./core/config";

function parseMappings(arr) {
  const mappedValues = {};
  arr.forEach(v => {
    const [key, value] = v.trim().split("=");
    if (!key || !value) {
      throw new Error(`Syntax error: ${v}`);
    }
    mappedValues[key] = value;
  });
  return mappedValues;
}

const mapRegionOption = {
  mapRegion: {
    type: "array",
    describe: `--mapRegion <aws-region-id>=<gcp-region-id>, 
Map a specific region from AWS to its GCP equivalent. Can be specified more than once.`,
    coerce: parseMappings
  }
};

const mapInstanceOption = {
  mapInstance: {
    type: "array",
    describe: `--mapInstance <aws-vmtype-id>=<gcp-vmtype-id>
Map a specific VM instance type from AWS to its GCP equivalent. Can be specified more than once.`,
    coerce: parseMappings
  }
};

yargs
  .scriptName("invoice-insights")
  .demandCommand()
  .version()
  .help()
  .example("$0 summary invoice.csv")
  .example("$0 instances invoice.csv --format csv")
  .example(
    "$0 instances invoice.csv --debug --roundMonths --mapRegion eu-central-1=europe-west1 --mapInstance x1e.16xlarge=n1-megamem-96"
  )
  .middleware(setOptions)
  .options({
    format: {
      describe: "Specify output format",
      choices: ["csv", "table"],
      default: "table"
    },
    debug: {
      type: "boolean",
      describe:
        "Include debugging information in output (e.g. pricing applied per vCPU/h and GB/h)"
    }
  })

  .command({
    command: "summary <filename>",
    example: "$0 summary test/test.csv",
    desc: "High-level summary of all AWS services in the invoice",
    handler: async argv => {
      const stats = (await parseCSV(argv.filename)).stats;
      const output = printSummary(stats);
      console.log(output);
    }
  })

  .command({
    command: "instances <filename>",
    desc:
      "Google Compute Engine instances equivalent to EC2 instances in the invoice",
    builder: {
      ...mapRegionOption,
      ...mapInstanceOption,
      memoryWindow: {
        type: "number",
        describe:
          "Set a window, expressed as percentage of memory, to consider a preconfigured VM from GCP a match (value between 0 and 1)",
        default: 0.1
      },
      roundMonths: {
        type: "boolean",
        describe:
          "Round the usage hours to entire months, at 730 hours per month (useful for debugging)",
        default: false
      }
    },
    handler: async ({ filename }) => {
      const { lines, warnings } = await parseCSV(filename);
      const output = printInstances(lines);
      console.log(output);
      warnings.map(warning => console.warn(chalk.red(warning)));
    }
  })

  .command({
    command: "storage <filename>",
    desc:
      "Block storage on Google Cloud equivalent to the EBS storage in the invoice",
    builder: {
      ...mapRegionOption
    },
    handler: async ({ filename }) => {
      const { storage, warnings } = await parseCSV(filename);
      const output = printStorage(storage);
      console.log(output);
      warnings.map(warning => console.warn(chalk.red(warning)));
    }
  })

  .command({
    command: "sql <filename>",
    desc: "Cloud SQL instances equivalent to the RDS instances in the invoice",
    builder: {
      ...mapRegionOption
    },
    handler: async ({ filename }) => {
      const { lines, warnings } = await parseCSV(filename);
      const output = printSQL(lines);
      console.log(output);
      warnings.map(warning => console.warn(chalk.red(warning)));
    }
  })

  .command({
    command: "cache <filename>",
    desc:
      "Prints a report of Memorystore equivalent to the ElastiCache instances in the invoice",
    builder: {
      ...mapRegionOption,
      tier: {
        describe: "MemoryStore tier",
        choices: ["basic", "standard"],
        default: "basic"
      }
    },
    handler: async ({ filename }) => {
      const { lines, warnings } = await parseCSV(filename);
      const output = printCache(lines);
      console.log(output);
      warnings.map(warning => console.warn(chalk.red(warning)));
    }
  })

  .fail((msg, err) => {
    if (err) {
      console.warn(err.stack);
    } else {
      console.warn(chalk.red(msg));
      yargs.showHelp();
    }
    process.exit(1);
  }).argv;
