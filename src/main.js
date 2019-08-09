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

import program from "commander";
import { parseCSV } from "./InvoiceParser";
import { printSummary } from "./SummaryReport";
import { printInstances } from "./InstanceReport";
import chalk from "chalk";
import options from "./Options";
import { printStorage } from "./StorageReport";
import { printSQL } from "./SqlReport";
import { printCache } from "./CacheReport";

program
  .version("0.1.0")
  .name("invoice-insights")
  .description("A tool to analyze your cloud invoice.")
  .option(
    "--format <value>",
    "specify output format. Valid values are [csv,table] (default: table)",
    f => options.setFormat(f)
  )
  .option(
    "--map-region <awsID>=<gcpID>",
    `Map specific regions from AWS to GCP equivalents. Can be specified more than once. Example: --map-region eu-central-1=europe-west1`,
    mi => options.addMappedRegion(mi)
  )
  .option(
    "--map-instance <value>",
    `Map specific instances from AWS to GCP equivalents. Can be specified more than once. Default is \n\t\t\t${Object.entries(
      options.mappedInstances
    )
      .map(([k, v]) => `${k}=${v}`)
      .join(",")}`,
    mi => options.addMappedInstance(mi)
  )
  .option(
    "--debug",
    "include debugging information in output (e.g. pricing applied per vCPU/h GB/h)",
    _ => (options.debug = true)
  );

program
  .command("summary <filename>")
  .description("Prints a high-level summary of all AWS services in the invoice")
  .action(async filename => {
    const stats = (await parseCSV(filename)).stats;
    const output = printSummary(stats);
    console.log(output);
  });

program
  .command("instances <filename>")
  .option(
    "--memory-window <value>",
    "Set a window, expressed as percentage of memory, to consider a preconfigured VM from GCP a match (value between 0 and 1, default 0.1)",
    mw => options.setMemoryWindow(mw)
  )
  .option(
    "--round-months",
    "round the usage hours to entire months, at 730 hours per month (useful for debugging)",
    _ => (options.roundMonths = true)
  )
  .description(
    "Prints a report of Google Compute Engine instances equivalent to the EC2 instances in the invoice"
  )
  .action(async filename => {
    const { lines, warnings } = await parseCSV(filename);
    const output = printInstances(lines);
    console.log(output);
    warnings.map(warning => console.warn(chalk.red(warning)));
  });

program
  .command("storage <filename>")
  .description(
    "Prints a report of Google Cloud storage equivalent to the EBS storage in the invoice"
  )
  .action(async filename => {
    const { storage, warnings } = await parseCSV(filename);
    const output = printStorage(storage);
    console.log(output);
    warnings.map(warning => console.warn(chalk.red(warning)));
  });

program
  .command("sql <filename>")
  .description(
    "Prints a report of Cloud SQL equivalent to the RDS instances in the invoice"
  )
  .action(async filename => {
    const { lines, warnings } = await parseCSV(filename);
    const output = printSQL(lines);
    console.log(output);
    warnings.map(warning => console.warn(chalk.red(warning)));
  });
program
  .command("cache <filename>")
  .description(
    "Prints a report of Memorystore equivalent to the ElastiCache instances in the invoice"
  )
  .option(
    "--tier <value>",
    "Set the Memorystore tier to use (one of: 'basic', 'standard'). Default is 'basic'.",
    value => options.setMemorystoreTier(value)
  )
  .action(async filename => {
    const { lines, warnings } = await parseCSV(filename);
    const output = printCache(lines);
    console.log(output);
    warnings.map(warning => console.warn(chalk.red(warning)));
  });

program.parse(process.argv);
