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
import { printCsvRow, toFixed, formatMoneyNumber, concatTruthy } from "./util";
import options from "./Options";
import { getAwsRegionByInvoiceCode } from "./Regions";
import { calculateBlockStoragePricing } from "./GcpPricing";

const bold = chalk.bold;

function isStorageSpace(productId) {
  return productId.startsWith("VolumeUsage") || productId == "SnapshotUsage";
}

function printTable(rows) {
  const result = rows.map(
    ({ region, productId, UsageQuantity, TotalCost, gcpStorage }) => {
      const { name, monthlyRate, detail } = gcpStorage || {};
      const gcpColumns = [
        region.gcp.id,
        gcpStorage && name,
        gcpStorage && formatMoneyNumber(monthlyRate)
      ];
      options.debug &&
        gcpColumns.push(
          gcpStorage &&
            `${formatMoneyNumber(detail.perGbMonth, 3)} per GB-month`
        );
      return [
        `${region.aws.id}\n${productId}`,
        concatTruthy([
          `${toFixed(parseFloat(UsageQuantity))} ${
            isStorageSpace(productId) ? "GB-months" : "iops"
          }`,
          !TotalCost ? "" : "$" + TotalCost
        ]),
        ...gcpColumns
      ];
    }
  );

  const debugHeaders = options.debug ? [bold("GCP Detail")] : [];
  return table(
    [
      [
        bold("AWS Product"),
        bold("Usage"),
        bold("GCP Region"),
        bold("GCP Product"),
        bold("GCP monthly"),
        ...debugHeaders
      ]
    ].concat(result)
  );
}

function printCSV(rows) {
  return (
    [
      "Region",
      "Product",
      "UsageQuantity",
      "TotalCost",
      "GCP region",
      "GCP Product",
      "GCP Monthly"
    ].concat(",") +
    "\n" +
    rows
      .map(({ region, productId, UsageQuantity, TotalCost, gcpStorage }) => {
        const { name, monthlyRate } = gcpStorage || {};
        return printCsvRow([
          region.aws.id,
          productId,
          UsageQuantity,
          TotalCost,
          region.gcp.id,
          name,
          monthlyRate && formatMoneyNumber(monthlyRate, 4)
        ]);
      })
      .join("\n")
  );
}

export function printStorage(storage) {
  const { format } = options;
  const rows = [];
  Object.entries(storage).forEach(([regionId, regionData]) => {
    const region = getAwsRegionByInvoiceCode(regionId);
    Object.entries(regionData).forEach(
      ([productId, { UsageQuantity, TotalCost }]) => {
        const gcpStorage = calculateBlockStoragePricing(
          region,
          productId,
          UsageQuantity
        );
        rows.push({
          region,
          productId,
          UsageQuantity,
          TotalCost,
          gcpStorage
        });
      }
    );
  });

  return format === "csv" ? printCSV(rows) : printTable(rows);
}
