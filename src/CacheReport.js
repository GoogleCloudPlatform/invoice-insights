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
} from "./util";
import options from "./Options";
import { formatAwsSpec, formatGcpSpec } from "./InstanceReport";

const bold = chalk.bold;

function printTable(lines) {
  const result = lines.map(
    ({
      key: { usageTypeId, productId },
      region,
      row: { UsageQuantity, TotalCost },
      awsVmType,
      capacityTier: { name, maxBandwidth },
      gcpPricing: { unitRate, monthlyRate } = {}
    }) => {
      return [
        `${region.aws.id}\n${usageTypeId}\n${productId}`,
        concatTruthy([
          `${toFixed(parseFloat(UsageQuantity))} hours`,
          !TotalCost ? "" : "$" + TotalCost
        ]),
        formatAwsSpec(awsVmType),
        concatTruthy([
          region.gcp.id,
          options.memorystoreTier,
          name,
          `max. ${maxBandwidth} Gbps`
        ]),
        concatTruthy([
          formatMoneyNumber(monthlyRate),
          `(${formatMoneyNumber(unitRate)} per Gb/hour)`
        ])
      ];
    }
  );
  return table([
    [
      bold("AWS Product"),
      bold("Usage"),
      bold("AWS Spec"),
      bold("GCP Product"),
      bold("On Demand")
    ],
    ...result
  ]);
}

function printCSV(lines) {
  return (
    [
      "Region",
      "Usage Type",
      "Product",
      "UsageQuantity",
      "TotalCost",
      "vCPU",
      "Memory",
      "ItemDescription",
      "GCP region",
      "GCP Service Tier",
      "GCP name",
      "GCP max bandwidth",
      "Unit cost",
      "Monthly"
    ].concat(",") +
    "\n" +
    lines
      .map(
        ({
          key: { usageTypeId, productId },
          region,
          row: { UsageQuantity, TotalCost, ItemDescription },
          awsVmType: { vCPU, memory },
          capacityTier: { name, maxBandwidth },
          gcpPricing: { unitRate, monthlyRate } = {}
        }) => {
          return printCsvRow([
            region.aws.id,
            usageTypeId,
            productId,
            UsageQuantity,
            TotalCost,
            vCPU,
            memory,
            ItemDescription.replace(/,/g, ""),
            region.gcp.id,
            options.memorystoreTier,
            name,
            maxBandwidth,
            formatMoneyNumber(unitRate),
            formatMoneyNumber(monthlyRate)
          ]);
        }
      )
      .join("\n")
  );
}

export function printCache(lines) {
  const { format } = options;
  const result = lines.filter(line => line.type === "CACHE");
  return format === "csv" ? printCSV(result) : printTable(result);
}
