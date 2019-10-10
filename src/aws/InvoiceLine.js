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

import { parseUsageType, roundMonths } from "../core/util";
import { getAwsVmType } from "./AwsStore";
import { getGcpStore } from "../gcp/GcpStore";
import { getAwsRegionByInvoiceCode } from "./Regions";
import {
  calculateSharedPricing,
  calculatePricing,
  calculatePremiumOsPricing,
  calculateSqlPricing,
  calculateMemorystorePricing
} from "../gcp/GcpPricing";
import assert from "assert";
import { options } from "../core/config";

function isEC2({ ProductCode, ProductName }) {
  return (
    ProductCode === "AmazonEC2" ||
    ProductName === "Amazon Elastic Compute Cloud"
  );
}

function isRDS({ ProductCode, ProductName }) {
  return (
    ProductCode === "AmazonRDS" ||
    ProductName === "Amazon Relational Database Service"
  );
}

function isElasticache({ ProductCode, ProductName }) {
  return (
    ProductCode === "AmazonElastiCache" || ProductName === "Amazon ElastiCache"
  );
}

export function extractOS(ItemDescription) {
  return ItemDescription.includes("Windows")
    ? "Windows"
    : ItemDescription.includes("RHEL")
    ? "RedHat"
    : ItemDescription.includes("SUSE")
    ? "Suse"
    : undefined;
}

export function extractAwsDatabaseName(ItemDescription) {
  const [database] =
    /PostgreSQL|Aurora|MySQL|MariaDB/.exec(ItemDescription) || [];
  assert(
    !!database,
    `Cannot find a recognized database name in: ${ItemDescription}`
  );
  return database;
}

export function awsDatabaseToGcp(awsDatabase) {
  if (awsDatabase === "PostgreSQL" || awsDatabase === "Aurora") {
    return "Postgres";
  } else if (awsDatabase === "MySQL" || awsDatabase === "MariaDB") {
    return "MySQL";
  } else {
    throw new Error(`Unrecognized database name: ${awsDatabase}`);
  }
}

export function awsCacheToGcpTier({ memory }) {
  if (memory < 5) {
    return {
      name: "M1",
      maxBandwidth: 3
    };
  } else if (memory < 11) {
    return {
      name: "M2",
      maxBandwidth: 3
    };
  } else if (memory < 35) {
    return {
      name: "M3",
      maxBandwidth: 3
    };
  } else if (memory < 100) {
    return {
      name: "M4",
      maxBandwidth: 6
    };
  } else {
    return {
      name: "M5",
      maxBandwidth: 12
    };
  }
}

const vmUsageTypes = new Set(["BoxUsage", "SpotUsage"]);

/**
 * Contains one processed line from the cloud invoice
 */
export class InvoiceLine {
  constructor(row) {
    try {
      const { regionId, usageTypeId, productId } = (this.key = parseUsageType(
        row.ProductName,
        row.UsageType
      ));
      const region = (this.region =
        regionId && getAwsRegionByInvoiceCode(regionId));
      this.row = row;
      if (isEC2(row) && vmUsageTypes.has(usageTypeId)) {
        this.processVmLine({ productId, region, row });
      } else if (
        isRDS(row) &&
        usageTypeId !== "RDS" &&
        usageTypeId !== "Aurora"
      ) {
        // Anything else should be an RDS/Aurora instance
        this.processRdsLine({ usageTypeId, productId, region, row });
      } else if (isElasticache(row) && usageTypeId === "NodeUsage") {
        this.processElasticacheLine({ productId, region, row });
      }
    } catch (e) {
      console.error(e.stack);
      throw new Error(
        `Cannot process { ProductName=${row.ProductName}, UsageType=${row.UsageType} } (${e.message})`
      );
    }
  }

  processVmLine({ productId, region, row }) {
    const awsVmType = getAwsVmType(productId);
    const gcpVmType = getGcpStore().guessVmType({
      region: region,
      name: productId,
      cpus: awsVmType.vCPU,
      memory: awsVmType.memory
    });
    const os = extractOS(row.ItemDescription);
    const gcpPricing = this.calculatePricing(gcpVmType, os);
    Object.assign(this, {
      type: "VM",
      awsVmType,
      gcpVmType,
      os,
      gcpPricing
    });
  }

  processRdsLine({ usageTypeId, productId, region, row: { ItemDescription } }) {
    const awsDatabase = extractAwsDatabaseName(ItemDescription);
    const gcpDatabase = awsDatabaseToGcp(awsDatabase);
    const awsVmType = getAwsVmType(productId.replace(/^db\./, ""));
    const gcpVmType = getGcpStore().guessVmType({
      region: region,
      name: productId,
      cpus: awsVmType.vCPU,
      memory: awsVmType.memory
    });
    const gcpPricing = this.calculateSqlPricing({
      ha: usageTypeId.includes("Multi-AZUsage"),
      database: gcpDatabase,
      gcpVmType
    });
    Object.assign(this, {
      type: "SQL",
      awsDatabase,
      gcpDatabase,
      awsVmType,
      gcpVmType,
      gcpPricing
    });
  }

  processElasticacheLine({ productId }) {
    const awsVmType = getAwsVmType(productId.replace(/^cache\./, ""));
    const capacityTier = awsCacheToGcpTier(awsVmType);
    const gcpPricing = this.calculateCachePricing({
      serviceTier: options.tier,
      capacityTier: capacityTier.name
    });
    Object.assign(this, {
      type: "CACHE",
      awsVmType,
      capacityTier,
      gcpPricing
    });
  }

  calculateCachePricing({ serviceTier, capacityTier }) {
    const sku = getGcpStore().getSkusForMemorystore({
      region: this.region,
      serviceTier,
      capacityTier
    });
    const gbHours = this.row.UsageQuantity;
    return calculateMemorystorePricing(gbHours, sku);
  }

  calculateSqlPricing({ ha, database, gcpVmType }) {
    const skus = getGcpStore().getSkusForSql({
      region: this.region,
      ha,
      name: gcpVmType.name,
      cpu: gcpVmType.guestCpus
    });

    //cpu: gcpVmType.guestCpus,
    //memory: mbToGb(gcpVmType.memoryMb + (gcpVmType.extendedMemoryMb || 0))

    const hours = this.row.UsageQuantity;
    return {
      ha,
      database,
      ...calculateSqlPricing(hours, gcpVmType, skus)
    };
  }

  calculatePricing(gcpVmType, os) {
    const skus = getGcpStore().getSkusForVm({
      region: this.region,
      name: gcpVmType.name
    });
    const { type, ...usageTypes } = skus;
    const result = {};
    let hours = this.row.UsageQuantity;
    if (options.roundMonths) {
      hours = roundMonths(hours);
    }

    const osPricing = !os
      ? undefined
      : calculatePremiumOsPricing(os, gcpVmType);

    Object.entries(usageTypes).forEach(([key, skus]) => {
      result[key] =
        type === "shared"
          ? calculateSharedPricing(key, hours, skus, osPricing)
          : calculatePricing(key, hours, gcpVmType, skus, osPricing);
    });
    return result;
  }
}
