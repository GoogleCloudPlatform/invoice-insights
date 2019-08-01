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

import fse from "mz/fs";
import path from "path";
import assert from "assert";
import { getAwsRegion, RegionCodeRegEx } from "./Regions";

export const HOURS_IN_A_MONTH = 730;
export const SECONDS_IN_AN_HOUR = 3600;
export const NANOS_IN_A_UNIT = 1000000000;

export function printCsvRow(row) {
  return row
    .map(cell => (typeof cell === "undefined" || cell === null ? "" : cell))
    .join(",");
}

export async function readJSON(f) {
  const filename = path.resolve(f);
  assert(fse.existsSync(filename), `File not found: ${filename}`);
  const fileContents = await fse.readFile(filename);
  return JSON.parse(fileContents);
}

export function mbToGb(memory) {
  return typeof memory === "undefined" ? undefined : memory / 1024;
}

export function gbToMb(memory) {
  return typeof memory === "undefined" ? undefined : memory * 1024;
}

export function toFixed(number) {
  return typeof number === "undefined"
    ? undefined
    : number.toFixed(2).replace(/[.,]00$/, "");
}

// Known errors on the AWS invoice export.
// Looks like typos in their export code?
function fixProductId(productId) {
  return productId === "db.m4.10xl" ? "db.m4.10xlarge" : productId;
}

// Usage regex:
// {region}-{usageType}:{productId}
// Region and product are optional
//
// /(([A-Z0-9]+)-)?([^:]+)(:(.+))?/
const usageTypeRegEx = new RegExp(`^(${RegionCodeRegEx}-)?([^:]+)(:(.+))?$`);
export function parseUsageType(productName, UsageType) {
  // KMS uses standard region names
  if (productName == "AWS Key Management Service") {
    const [, regionId, usageTypeId] = /(.+)\-KMS\-(.+)?/.exec(UsageType);
    return { regionId: getAwsRegion(regionId).code, usageTypeId };
  }

  // CloudFront uses its own regional codes
  if (productName == "Amazon CloudFront") {
    const [, usageTypeId, , productId] = /([A-Z0-9]+)(-(.+))?/.exec(UsageType);
    return { usageTypeId, productId };
  }

  const parts = usageTypeRegEx.exec(UsageType);
  if (!parts) {
    throw new Error(
      `Cannot parse { productName ${productName}, UsageType: ${UsageType} }`
    );
  }
  const [, , regionId, usageTypeId, , productId] = parts;
  return {
    regionId: regionId || "USE1",
    usageTypeId,
    productId: fixProductId(productId)
  };
}

export function getGcpVmTypeDescription(name) {
  if (name === "custom") {
    return "Custom";
  }
  if (
    name.startsWith("m2-") ||
    name.startsWith("n1-ultramem") ||
    name.startsWith("n1-megamem")
  ) {
    return "Memory-optimized";
  }
  if (name.startsWith("n1-")) {
    return "N1 Predefined";
  }
  if (name.startsWith("c2-")) {
    return "Compute optimized";
  }
  // not addressed: 'Sole Tenancy'
  throw new Error(`Cannot recognize the SKU description for VM: ${name}`);
}

// resourceType: one of 'Core', 'Ram'
// name: name of the VM type (for GCP)
// everything else is boolean
export function getGcpSkuDescription({
  committed,
  preemptible,
  name,
  resourceType,
  extended
}) {
  const vmType = getGcpVmTypeDescription(name);
  if (committed) {
    return [
      "Commitment v1:",
      vmType == "Memory-optimized" && vmType,
      resourceType
    ]
      .filter(v => !!v)
      .join(" ");
  }
  return [
    preemptible ? "Preemptible" : "",
    vmType,
    extended ? "Extended" : "",
    "Instance",
    resourceType
  ]
    .filter(v => !!v)
    .join(" ");
}

export function formatMoneyNumber(number, precision = 4) {
  return "$" + parseFloat(number).toFixed(precision);
}

export function formatPercentage(number) {
  return toFixed(number * 100) + "%";
}

export function roundMonths(hours) {
  return Math.ceil(parseFloat(hours) / HOURS_IN_A_MONTH) * HOURS_IN_A_MONTH;
}

export function concatTruthy(values, separator = "\n") {
  return values.filter(v => !!v).join(separator);
}

export function lazyInitObject(container, field, factoryCallback) {
  let result = container[field];
  if (!result) {
    result = container[field] = factoryCallback ? factoryCallback() : {};
  }
  return result;
}
