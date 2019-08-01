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
import { printCsvRow } from "./util";
import options from "./Options";

function printCSV(rows) {
  return (
    "Product Category,Usage Type,Product,UsageQuantity,TotalCost\n" +
    rows.map(printCsvRow).join("\n")
  );
}
function printTable(rows) {
  return table(
    [
      [
        chalk.bold("Product"),
        chalk.bold("UsageQuantity"),
        chalk.bold("TotalCost")
      ]
    ].concat(
      rows.map(
        ([
          productCategoryId,
          usageTypeId,
          productId,
          UsageQuantity,
          TotalCost
        ]) => {
          return [
            productCategoryId + "\n" + usageTypeId + "\n" + productId,
            UsageQuantity,
            TotalCost
          ];
        }
      )
    ),
    {
      columns: {
        0: {
          alignment: "left"
        },
        1: {
          alignment: "right"
        },
        2: {
          alignment: "right"
        }
      }
    }
  );
}

export function printSummary(stats) {
  const { format } = options;
  const rows = [];
  Object.entries(stats).forEach(([productCategoryId, productCategory]) => {
    Object.entries(productCategory).forEach(([usageTypeId, usageType]) => {
      Object.entries(usageType).forEach(([productId, productStats]) => {
        const { UsageQuantity, TotalCost } = productStats;
        rows.push([
          productCategoryId,
          usageTypeId,
          productId,
          UsageQuantity,
          TotalCost
        ]);
      });
    });
  });

  return format === "csv" ? printCSV(rows) : printTable(rows);
}
