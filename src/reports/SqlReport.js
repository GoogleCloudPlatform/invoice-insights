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

import { table } from "table";
import chalk from "chalk";
import {
  printCsvRow,
  mbToGb,
  toFixed,
  formatMoneyNumber,
  concatTruthy
} from "../core/util";
import { formatAwsSpec, formatGcpSpec } from "./InstanceReport";
import { options } from "../core/config";

const bold = chalk.bold;

function printTable(lines) {
  const result = lines.map(
    ({
      key: { regionId, usageTypeId, productId },
      region,
      awsDatabase,
      gcpDatabase,
      row: { UsageQuantity, TotalCost },
      awsVmType,
      gcpVmType: { extendedMemoryMb, ...gcpVmType },
      gcpPricing: { ha, hourlyRate, monthlyRate } = {}
    }) => {
      return [
        `${region.aws.id}\n${awsDatabase}\n${usageTypeId}\n${productId}`,
        concatTruthy([
          `${toFixed(parseFloat(UsageQuantity))} hours`,
          !TotalCost ? "" : "$" + TotalCost
        ]),
        formatAwsSpec(awsVmType),
        `${region.gcp.id}\n${gcpDatabase}${ha ? " HA" : ""}\n${gcpVmType.name}`,
        formatGcpSpec(gcpVmType),
        `${formatMoneyNumber(monthlyRate)}\n(${formatMoneyNumber(
          hourlyRate
        )} per hour)`
      ];
    }
  );
  return table([
    [
      bold("AWS Product"),
      bold("Usage"),
      bold("AWS Spec"),
      bold("GCP Product"),
      bold("GCP Spec"),
      bold("On Demand")
    ],
    ...result
  ]);
}

function printCSV(lines) {
  return (
    [
      "Region",
      "Database",
      "Usage Type",
      "Product",
      "UsageQuantity",
      "TotalCost",
      "vCPU",
      "Memory",
      "ItemDescription",
      "GCP region",
      "GCP Database",
      "GCP name",
      "GCP CPU",
      "GCP Memory",
      "Hourly",
      "Monthly"
    ].concat(",") +
    "\n" +
    lines
      .map(
        ({
          key: { usageTypeId, productId },
          region,
          awsDatabase,
          gcpDatabase,
          row: { UsageQuantity, TotalCost, ItemDescription },
          awsVmType: { vCPU, memory },
          gcpVmType: { name, guestCpus, memoryMb },
          gcpPricing: { ha, hourlyRate, monthlyRate } = {}
        }) => {
          return printCsvRow([
            region.aws.id,
            awsDatabase,
            usageTypeId,
            productId,
            UsageQuantity,
            TotalCost,
            vCPU,
            memory,
            ItemDescription.replace(/,/g, ""),
            region.gcp.id,
            `${gcpDatabase}${ha ? " HA" : ""}`,
            name == "custom" ? name : "db-" + name,
            guestCpus,
            toFixed(mbToGb(memoryMb)),
            formatMoneyNumber(hourlyRate),
            formatMoneyNumber(monthlyRate)
          ]);
        }
      )
      .join("\n")
  );
}

export function printSQL(lines) {
  const result = lines.filter(line => line.type === "SQL");
  return options.format === "csv" ? printCSV(result) : printTable(result);
}
