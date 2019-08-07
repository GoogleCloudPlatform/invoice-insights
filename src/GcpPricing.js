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
import assert from "assert";
import { HOURS_IN_A_MONTH, NANOS_IN_A_UNIT } from "./util";
import { getGcpStore } from "./GcpStore";

// return the % of SUD (value between 0 and 1)
export function calculateSudDiscount(hours) {
  hours = new Big(hours);
  const completeMonths = new Big(Math.floor(hours.div(HOURS_IN_A_MONTH)));
  const completeMonthsDiscount = completeMonths.mul(HOURS_IN_A_MONTH).mul(0.3);
  const lastMonthHours = hours.mod(HOURS_IN_A_MONTH);
  let incompleteMonthDiscount = new Big(0);
  for (let i = lastMonthHours, j = 0; i > 0; i -= 182.5, j++) {
    incompleteMonthDiscount = incompleteMonthDiscount.plus(
      new Big(Math.min(182.5, i)).mul(j).mul(0.2)
    );
  }
  return completeMonthsDiscount
    .plus(incompleteMonthDiscount)
    .div(hours)
    .toString();
}

// return the pricing in the sku, in $ per nano (10^-9)
// if there are multiple tiered rates, it will select the last one. Double check if this is what you want.
export function skuToCostPerUnit(sku) {
  const {
    pricingInfo: [
      {
        pricingExpression: { tieredRates }
      }
    ]
  } = sku;
  const {
    unitPrice: { units, nanos }
  } = !tieredRates ? {} : tieredRates[tieredRates.length - 1];
  assert(
    !!nanos,
    `Cannot find nanos != 0 (found pricingInfo[0].pricingExpression.tieredRates[].unitPrice=${JSON.stringify(
      {
        units,
        nanos
      }
    )}) in ${JSON.stringify(sku)}`
  );
  return units !== "0"
    ? new Big(units).plus(new Big(nanos).div(NANOS_IN_A_UNIT))
    : new Big(nanos).div(NANOS_IN_A_UNIT);
}

// transform all Big values to string. Works recursively with nested JSON objects
function bigToString(object) {
  const copy = {};
  Object.entries(object)
    .filter(([_, value]) => !!value)
    .forEach(
      ([key, value]) =>
        (copy[key] =
          value.constructor === {}.constructor
            ? bigToString(value)
            : value.toString())
    );
  return copy;
}

// calculate pricing for f1-micro and g1-small
export function calculateSharedPricing(key, hours, sku, osPricing) {
  let hourlyRate = skuToCostPerUnit(sku);
  const detail = {
    cpu: hourlyRate
  };

  if (key === "onDemand") {
    const sudPct = calculateSudDiscount(new Big(hours));
    hourlyRate = hourlyRate.mul(new Big(1).minus(sudPct));
    detail.sudPct = sudPct;
  }

  if (osPricing) {
    detail.osHourly = osPricing;
    detail.osMonthly = osPricing.mul(hours);
    hourlyRate = hourlyRate.plus(osPricing);
  }

  return bigToString({
    hourlyRate,
    monthlyRate: hourlyRate.mul(hours),
    detail
  });
}

// calculate pricing for preconfigured, memory-optimized and custom VMs
// return:
// hourlyRate, monthlyRate: the rate with the SUD already factored in, if applicable
// detail: the unit prices (per CPU/hour, per Gb/hour) applied to calculate the hourlyRate,
// for audit purposes
export function calculatePricing(
  usageType,
  hours,
  { guestCpus, memoryMb, extendedMemoryMb },
  { cpu: cpuSku, memory: memorySku, extendedMemory: extendedMemorySku },
  osPricing
) {
  const sudPct = calculateSudDiscount(new Big(hours));
  const sudAdjust = new Big(1).minus(sudPct);
  const cpuUnitCost = skuToCostPerUnit(cpuSku);
  const memoryUnitCost = skuToCostPerUnit(memorySku);
  const extendedMemoryUnitCost = !extendedMemoryMb
    ? undefined
    : skuToCostPerUnit(extendedMemorySku);

  const detail = {
    cpu: cpuUnitCost,
    memory: memoryUnitCost
  };
  let hourlyRate = detail.cpu
    .mul(guestCpus)
    .plus(detail.memory.mul(memoryMb).div(1024));

  // apply sud discount
  if (usageType == "onDemand") {
    hourlyRate = hourlyRate.mul(sudAdjust);
    detail.sudPct = sudPct;
  }

  if (extendedMemoryMb) {
    // extended memory does not apply commitments, but still get SUD
    detail.extendedMemory = extendedMemoryUnitCost;
    if (usageType == "commit1Yr" || usageType == "commit3Yr") {
      detail.extendedMemorySudPct = sudPct;
    }

    const em = extendedMemoryUnitCost.mul(extendedMemoryMb).div(1024);
    hourlyRate = hourlyRate.plus(
      usageType === "preemptible" ? em : em.mul(sudAdjust)
    );
  }

  if (osPricing) {
    detail.osHourly = osPricing;
    detail.osMonthly = osPricing.mul(hours);
    hourlyRate = hourlyRate.plus(osPricing);
  }

  return bigToString({
    hourlyRate,
    monthlyRate: hourlyRate.mul(hours),
    detail
  });
}

export function calculatePremiumOsPricing(os, gcpVm) {
  const sku = getGcpStore().getSkusForPremiumOs(os);
  const { name, guestCpus } = gcpVm;
  if (os === "Windows") {
    return name === "f1-micro" || name === "g1-small"
      ? skuToCostPerUnit(sku[name])
      : skuToCostPerUnit(sku.perCpu).mul(guestCpus);
  } else if (os === "RedHat") {
    return guestCpus <= 4
      ? skuToCostPerUnit(sku["1-4cpu"])
      : skuToCostPerUnit(sku[">5cpu"]);
  } else if (os === "Suse") {
    return name === "f1-micro" || name === "g1-small"
      ? skuToCostPerUnit(sku[name])
      : skuToCostPerUnit(sku.perVm);
  } else {
    throw new Error(`Cannot recognize premium OS: ${os}`);
  }
}

export function calculateBlockStoragePricing(
  region,
  awsProductId,
  UsageQuantity
) {
  let productName, skuName;
  if (awsProductId === "SnapshotUsage") {
    productName = "snapshot";
    skuName = "Storage PD Snapshot";
  } else if (
    awsProductId === "VolumeUsage" ||
    awsProductId === "VolumeUsage.st1"
  ) {
    productName = "pd";
    skuName = "Storage PD Capacity";
  } else if (
    awsProductId === "VolumeUsage.gp2" ||
    awsProductId === "VolumeUsage.piops"
  ) {
    productName = "ssd";
    skuName = "SSD backed PD Capacity";
  } else {
    // iops
    return undefined;
  }

  const regionId = region.gcp.id;

  const sku = getGcpStore().findSkusByDescription(
    regionId,
    skuName,
    sku => sku.category.serviceDisplayName == "Compute Engine"
  );
  const costPerGb = skuToCostPerUnit(sku);
  return bigToString({
    name: productName,
    monthlyRate: costPerGb.mul(UsageQuantity),
    detail: {
      perGbMonth: costPerGb
    }
  });
}

export function calculateSqlPricing(hours, gcpVmType, skus) {
  const { ha, database, onDemand, cpu, memory } = skus;
  const { guestCpus, memoryMb } = gcpVmType;

  let detail;
  let hourlyRate;
  if (onDemand) {
    hourlyRate = skuToCostPerUnit(onDemand);
  } else {
    const cpuUnitCost = skuToCostPerUnit(cpu);
    const memoryUnitCost = skuToCostPerUnit(memory);
    detail = {
      cpu: cpuUnitCost,
      memory: memoryUnitCost
    };
    hourlyRate = detail.cpu
      .mul(guestCpus)
      .plus(detail.memory.mul(memoryMb).div(1024));
  }

  // HA is caculated by multiplying by two for both Postgres and MySQL
  if (ha) {
    hourlyRate = hourlyRate.mul(2);
  }

  return bigToString({
    hourlyRate,
    monthlyRate: hourlyRate.mul(hours),
    detail
  });
}

export function calculateMemorystorePricing(gbHours, sku) {
  const unitRate = skuToCostPerUnit(sku);
  return bigToString({
    unitRate,
    monthlyRate: unitRate.mul(gbHours)
  });
}
