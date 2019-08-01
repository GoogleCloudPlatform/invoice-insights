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

import Big from "big-js";
import options from "./Options";
import { mbToGb, lazyInitObject } from "./util";

class StatsSink {
  constructor() {
    this.UsageQuantity = new Big(0);
    this.TotalCost = new Big(0);
  }
  add(UsageQuantity, TotalCost) {
    this.UsageQuantity = this.UsageQuantity.plus(UsageQuantity);
    this.TotalCost = this.TotalCost.plus(TotalCost || "0"); // todo: useListedPrices
  }
}

/**
 * Accumulates metrics and warnings about the invoice
 */
export default class InvoiceLineObserver {
  constructor() {
    // generic summary information
    this.stats = {};

    // accumulated block storage information
    this.storage = {};

    // t2 instances being used that will not map to shared instances on GCP
    this.sharedVmTypes = new Set();

    // instances that are configured manually to map to something else
    this.mappedInstances = new Set();

    // MySQL instances on RDS mapped to custom VMs and Postgres on Cloud SQL
    this.customMySqlInstances = new Set();

    // instances that could not be mapped
    this.notMatched = new Set();
    this.notMatchedCount = 0;

    // generic messages
    this.messages = new Set();

    if (options.roundMonths) {
      this.messages.add(
        "For GCP pricing calculation, usage hours have been rounded to entire months (multiples of 730 hours)"
      );
    }

    if (Object.keys(options.mappedRegions).length) {
      this.messages.add(
        `Overriden region mappings: ${Object.entries(options.mappedRegions)
          .map(([key, value]) => `${key}=${value}`)
          .join(",")}`
      );
    }
  }

  observe(line) {
    let {
      type,
      awsDatabase,
      gcpDatabase,
      key: { regionId, usageTypeId, productId },
      awsVmType,
      gcpVmType
    } = line;
    const { ProductCode, ProductName, UsageQuantity, TotalCost } = line.row;
    const productCategoryId = ProductCode || ProductName; // in case the productCode has been filtered out for whatever reason
    if (!productId) {
      productId = "default";
    }

    // shared core family on AWS
    const awsSharedCore = productId.startsWith("t2.");

    // add stats
    let productCategory = lazyInitObject(this.stats, productCategoryId);
    let usageType = lazyInitObject(productCategory, usageTypeId);
    let product = lazyInitObject(usageType, productId, () => new StatsSink());
    product.add(UsageQuantity, TotalCost);

    // add storage
    if (usageTypeId === "EBS") {
      this.addStorageEntry({ regionId, productId, UsageQuantity, TotalCost });
    }

    // === alerts ===

    // shared t2 instances translated to dedicated (instead of shared) because
    // there are no suitable VM sizes on GCP
    if (awsSharedCore && gcpVmType && !gcpVmType.isSharedCpu) {
      this.sharedVmTypes.add(productId);
    }

    // instances on RDS that could not be mapped to preconfigured standard instances on Cloud SQL
    if (gcpDatabase == "MySQL" && gcpVmType && gcpVmType.name == "custom") {
      this.customMySqlInstances.add("db." + awsVmType.instance_type);
    }

    // Aurora instances are mapped to Postgres
    if (awsDatabase == "Aurora") {
      this.messages.add(
        `Aurora instances were mapped to equivalent Postgres instances`
      );
    }

    // warn of custom mapped instances
    if (productId && options.mappedInstances[productId]) {
      this.mappedInstances.add(productId);
    }

    // warn custom extended memory does not aply commitments
    if (gcpVmType && gcpVmType.extendedMemory) {
      this.messages.add(
        `VM custom_${gcpVmType.guestCpus}_${mbToGb(
          gcpVmType.memoryMb + gcpVmType.extendedMemoryMb
        )} will not apply Commit 1yr/3yr to extended memory. Applying SUD instead to ${mbToGb(
          gcpVmType.extendedMemoryMb
        )} GB of extended memory`
      );
    }

    // did not find anything suitable for this VM type
    if (awsVmType && !gcpVmType) {
      this.notMatched.add(awsVmType.name);
      this.notMatchedCount++;
    }
  }

  addStorageEntry({ regionId, productId, UsageQuantity, TotalCost }) {
    const storage = this.storage;
    const regionData = lazyInitObject(storage, regionId);
    const result = lazyInitObject(regionData, productId, () => new StatsSink());
    result.add(UsageQuantity, TotalCost);
  }

  get warnings() {
    let warnings = [];

    if (!!this.sharedVmTypes.size) {
      warnings.push(
        `[${[...this.sharedVmTypes].join(
          ","
        )}] instances will be mapped to non-shared equivalents on GCP`
      );
    }

    if (!!this.mappedInstances.size) {
      warnings.push(
        `[${[...this.mappedInstances].join(
          ","
        )}] instances are mapped manually. Please review the results.`
      );
    }

    if (!!this.notMatchedCount) {
      warnings.push(
        `[${[...this.notMatched].join(
          ","
        )}] could not be mapped to an equivalent GCP instance. Total number of unmatched instances: ${
          this.notMatchedCount
        }`
      );
    }

    if (!!this.customMySqlInstances.size) {
      warnings.push(
        `[${[...this.customMySqlInstances].join(
          ","
        )}] could not be mapped to an equivalent Cloud SQL MySQL instance. An equivalent custom PostgreSQL instance will be used instead`
      );
    }

    return [...warnings, ...this.messages];
  }
}
