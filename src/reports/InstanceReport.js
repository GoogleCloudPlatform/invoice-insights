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
  formatPercentage,
  roundMonths,
  HOURS_IN_A_MONTH,
  concatTruthy
} from "../core/util";
import { options } from "../core/config";

const bold = chalk.bold;

export function formatAwsSpec(vmType) {
  if (!vmType) {
    return "";
  }
  const { vCPU, GPU, memory, storage, pricing, ebs_iops } = vmType;
  return concatTruthy([
    `vCPU: ${vCPU}`,
    `Mem: ${memory} GB`,
    !!storage
      ? `Storage: ${storage.devices} x ${storage.size} GB ${
          storage.ssd ? "SSD" : ""
        }`
      : "",
    !!GPU ? `GPU: ${GPU}` : "",
    `EBS IOPS: ${ebs_iops}`
  ]);
}

export function formatGcpSpec(gcpVmType) {
  if (!gcpVmType) {
    return "";
  }
  const { name, guestCpus, memoryMb, extendedMemoryMb } = gcpVmType;
  return concatTruthy([
    `vCPU: ${guestCpus}`,
    `Mem: ${toFixed(mbToGb(memoryMb))} GB`,
    extendedMemoryMb && `Ext Mem: ${toFixed(mbToGb(extendedMemoryMb))} GB`
  ]);
}

function formatPricingDetail(detail, osName) {
  const {
    sudPct,
    cpu,
    memory,
    extendedMemory,
    extendedMemorySudPct,
    osHourly
  } = detail;
  return concatTruthy([
    sudPct && `SUD ${formatPercentage(sudPct)}`,
    `${formatMoneyNumber(cpu, 6)} vCPU/h`,
    memory && `${formatMoneyNumber(memory, 6)} GB/h`,
    extendedMemory && `${formatMoneyNumber(extendedMemory, 6)} GB/h e.m.`,
    extendedMemorySudPct &&
      `e.m. SUD ${formatPercentage(extendedMemorySudPct)}`,
    osName && `${formatMoneyNumber(osHourly, 4)}/h ${osName}`
  ]);
}

function printTable(rows) {
  const result = rows.map(
    ({
      key: { regionId, usageTypeId, productId },
      region,
      row: { UsageQuantity, TotalCost },
      awsVmType,
      gcpVmType,
      gcpPricing: { onDemand, preemptible, commit1Yr, commit3Yr } = {},
      os
    }) => {
      const awsColumns = [
        `${region.aws.id}\n${usageTypeId}\n${productId}`,
        concatTruthy([
          `${toFixed(parseFloat(UsageQuantity))} hours`,
          !options.roundMonths
            ? ""
            : `(rounded: ${roundMonths(UsageQuantity)})`,
          !TotalCost ? "" : "$" + TotalCost
        ]),
        formatAwsSpec(awsVmType)
      ];

      function pricingColumns(pricing) {
        const monthlyRate =
          pricing && `${formatMoneyNumber(pricing.monthlyRate)}`;
        return options.debug
          ? [monthlyRate, pricing && formatPricingDetail(pricing.detail, os)]
          : [monthlyRate];
      }

      const gcpColumns = !gcpVmType
        ? Array(10).fill("")
        : [
            `${region.gcp.id}\n${gcpVmType.name}`,
            formatGcpSpec(gcpVmType),
            ...pricingColumns(onDemand),
            ...pricingColumns(preemptible),
            ...pricingColumns(commit1Yr),
            ...pricingColumns(commit3Yr)
          ];
      return [...awsColumns, ...gcpColumns];
    }
  );

  const pricingHeaders = options.debug
    ? [
        bold("On Demand"),
        bold("OD Detail"),
        bold("Preemptible"),
        bold("Pr Detail"),
        bold("Commit 1yr"),
        bold("C1yr Detail"),
        bold("Commit 3yr"),
        bold("C3yr Detail")
      ]
    : [
        bold("On Demand"),
        bold("Preemptible"),
        bold("Commit 1yr"),
        bold("Commit 3yr")
      ];

  return table(
    [
      [
        bold("AWS Product"),
        bold("Usage"),
        bold("AWS Spec"),
        bold("GCP Product"),
        bold("GCP Spec"),
        ...pricingHeaders
      ]
    ].concat(result)
  );
}

function printCSV(rows) {
  return (
    [
      "Region",
      "Usage Type",
      "Product",
      "UsageQuantity",
      "TotalCost",
      "vCPU",
      "GPU",
      "Memory",
      "Storage",
      "Storage Type",
      "Instances",
      "Total CPU",
      "Total memory",
      "ItemDescription",
      "GCP region",
      "GCP name",
      "GCP CPU",
      "GCP Memory",
      "GCP Extended Memory",
      "OS",
      "OS license",
      "SUD",
      "On Demand",
      "Preemptible",
      "Commit1Yr",
      "Commit3Yr"
    ].concat(",") +
    "\n" +
    rows
      .map(
        ({
          key: { usageTypeId, productId },
          region,
          row: { UsageQuantity, TotalCost, ItemDescription },
          awsVmType: { vCPU, GPU, memory, storage, pricing, ebs_iops },
          gcpVmType: { name, guestCpus, memoryMb, extendedMemoryMb } = {},
          gcpPricing: { onDemand, preemptible, commit1Yr, commit3Yr } = {},
          os
        }) => {
          const instances = Math.ceil(
            parseFloat(UsageQuantity) / HOURS_IN_A_MONTH
          );
          return printCsvRow([
            region.aws.id,
            usageTypeId,
            productId,
            UsageQuantity,
            TotalCost,
            vCPU,
            GPU,
            memory,
            !storage ? 0 : storage.devices * storage.size,
            !storage ? "" : storage.ssd && "SSD",
            instances,
            instances * vCPU,
            toFixed(instances * parseFloat(memory)),
            ItemDescription.replace(/,/g, ""),
            region.gcp.id,
            name,
            guestCpus,
            toFixed(mbToGb(memoryMb)),
            toFixed(mbToGb(extendedMemoryMb)),
            os,
            os && formatMoneyNumber(onDemand.detail.osMonthly),
            onDemand && `${formatPercentage(onDemand.detail.sudPct)}`,
            onDemand && `${formatMoneyNumber(onDemand.monthlyRate)}`,
            preemptible && `${formatMoneyNumber(preemptible.monthlyRate)}`,
            commit1Yr && `${formatMoneyNumber(commit1Yr.monthlyRate)}`,
            commit3Yr && `${formatMoneyNumber(commit3Yr.monthlyRate)}`
          ]);
        }
      )
      .join("\n")
  );
}

export function printInstances(lines) {
  const { format } = options;
  const result = lines.filter(line => line.type === "VM");
  return format === "csv" ? printCSV(result) : printTable(result);
}
