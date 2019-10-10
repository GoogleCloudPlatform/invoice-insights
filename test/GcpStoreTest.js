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

import { getGcpStore, initGcpStore } from "../src/gcp/GcpStore";
import { getGcpRegion } from "../src/aws/Regions";
import { skuToCostPerUnit } from "../src/gcp/GcpPricing";
import { setOptions } from "../src/core/config";
import expect from "expect";

describe("GcpStore", function() {
  let store;
  const region = getGcpRegion("europe-west1");

  before(async () => {
    setOptions();
    await initGcpStore();
    store = getGcpStore();
  });

  it("should parse the Gcp instance types", () => {
    expect(store.skus).toBeDefined();
    expect(store.getVmType("n1-highcpu-4")).toBeDefined();
    const regionData = store.vmTypesByRegion["europe-west1"];
    expect(regionData.vmsSupported).toContain("n1-highmem-16");
    expect(regionData.vmsSupported).toContain("n1-megamem-96");
    expect(regionData.vmsByCpu).toBeDefined();
  });

  it("should guess standard GCP VM type", () => {
    expect(store.guessVmType({ region, cpus: 16, memory: 105 })).toMatchObject({
      name: "n1-highmem-16",
      guestCpus: 16,
      memoryMb: 106496
    });

    setOptions({ memoryWindow: 1 });
    expect(store.guessVmType({ region, cpus: 16, memory: 106 })).toMatchObject({
      name: "n1-highcpu-16",
      guestCpus: 16,
      memoryMb: 14746
    });
  });

  it("should differentiate shared core and standard VM type", () => {
    expect(
      store.guessVmType({ region, name: "t2.nano", cpus: 1, memory: 0.5 })
    ).toMatchObject({
      name: "f1-micro"
    });
  });

  it("should respect the configured mapInstances", () => {
    expect(store.guessVmType({ region, name: "x1e.16xlarge" })).toMatchObject({
      name: "n1-megamem-96"
    });
  });

  it("should fail to find impossible configurations", () => {
    // number of CPUs does not exist
    expect(store.guessVmType({ region, cpus: 17, memory: 106 })).toMatchObject({
      name: "custom",
      guestCpus: 18,
      memoryMb: 108544
    });

    // memory size does not exist within this memoryWindow
    expect(
      store.guessVmType({ region, cpus: 16, memory: 1, memoryWindow: 0.001 })
    ).toMatchObject({
      name: "custom",
      guestCpus: 16,
      memoryMb: 1024
    });
  });

  it("should get SKUs by region", () => {
    const skus = store.getSkusByRegion("europe-west1");
    expect(skus.length).toBeGreaterThan(180);
    expect(skus[0].serviceRegions).toContain("europe-west1");
  });

  it("should get SKUs for VMs", () => {
    function matchSku(sku, expectedUsageType, expectedCPU, expectedRAM) {
      expect(sku.cpu.category.usageType).toMatch(expectedUsageType);
      expect(sku.memory.category.usageType).toMatch(expectedUsageType);
      expect(sku.cpu.category.resourceGroup).toMatch(expectedCPU);
      expect(sku.memory.category.resourceGroup).toMatch(expectedRAM);
    }

    function checkSkus(args) {
      const result = store.getSkusForVm(args);
      const { commit1Yr, commit3Yr, preemptible, onDemand } = result;
      const expectedCPU = args.name == "n1-standard-2" ? "N1Standard" : "CPU";
      const expectedRAM = args.name == "n1-standard-2" ? "N1Standard" : "RAM";

      // a couple of tests to confirm that we have the right SKUs
      matchSku(commit1Yr, "Commit1Yr", "CPU", "RAM");
      matchSku(commit3Yr, "Commit3Yr", "CPU", "RAM");
      matchSku(preemptible, "Preemptible", expectedCPU, expectedRAM);
      matchSku(onDemand, "OnDemand", expectedCPU, expectedRAM);
      return result;
    }

    // normal VM: SUD, preemptible, 1yr and 3yr commitment
    let sku = checkSkus({ region, name: "n1-standard-2" });
    expect(sku.onDemand.extendedMemory).toBeFalsy();

    // custom VM
    sku = checkSkus({ region, name: "custom" });
    expect(sku.onDemand.extendedMemory.category.resourceGroup).toMatch("RAM");
    expect(sku.commit1Yr.extendedMemory.category.resourceGroup).toMatch("RAM");

    // ultramem instance
    sku = checkSkus({ region, name: "n1-ultramem-80" });

    // shared core
    store.getSkusForVm({ region, name: "f1-micro" });
    store.getSkusForVm({ region, name: "g1-small", preemptible: true });
  });

  it("should get premium OS skus", () => {
    // specifically premium OS
    const sku = store.getSkusForPremiumOs("Windows");
    expect(Object.keys(sku)).toMatchObject(["f1-micro", "g1-small", "perCpu"]);
    store.getSkusForPremiumOs("RedHat");
    store.getSkusForPremiumOs("Suse");
  });

  it("should get SKUs for MySQL", () => {
    function getMySqlSkus(args) {
      return store.getSkusForSql({
        region,
        database: "MySQL",
        ...args
      });
    }

    // shared core instance
    let result = getMySqlSkus({
      ha: false,
      name: "f1-micro"
    });
    expect(result.database).toMatch("MySQL");
    expect(result.onDemand.description).toMatch(
      "DB generic Micro instance with burstable CPU running in EU (with 30% promotional discount)"
    );

    // shared core instance but with HA
    result = getMySqlSkus({
      ha: true,
      name: "f1-micro"
    });
    expect(result.onDemand.description).toMatch(
      "DB generic Micro instance with burstable CPU running in EU (with 30% promotional discount)"
    );

    // standard VM
    result = getMySqlSkus({
      ha: false,
      name: "n1-standard-2",
      cpu: 2
    });
    expect(result);
    expect(result.cpu.description).toMatch(
      "DB custom CORE running in EU (with 30% promotional discount)"
    );
  });

  it("should get SKUs for Postgres", () => {
    function getPostgresSkus(args) {
      return store.getSkusForSql({
        region,
        database: "Postgres",
        ...args
      });
    }

    // shared core instance
    let result = getPostgresSkus({
      ha: false,
      name: "f1-micro"
    });
    expect(result.database).toMatch("Postgres");
    expect(result.onDemand.description).toMatch(
      "DB generic Micro instance with burstable CPU running in EU (with 30% promotional discount)"
    );
    skuToCostPerUnit(result.onDemand);

    // shared core instance but with HA
    result = getPostgresSkus({
      ha: true,
      name: "f1-micro"
    });
    expect(result.onDemand.description).toMatch(
      "DB generic Micro instance with burstable CPU running in EU (with 30% promotional discount)"
    );
    skuToCostPerUnit(result.onDemand);

    // standard VM
    result = getPostgresSkus({
      ha: false,
      name: "n1-standard-2",
      cpu: 2
    });
    expect(result);
    expect(result.cpu.description).toMatch(
      "DB custom CORE running in EU (with 30% promotional discount)"
    );
    skuToCostPerUnit(result.cpu);
    skuToCostPerUnit(result.memory);

    // standard HA VM
    result = getPostgresSkus({
      ha: true,
      name: "n1-standard-2",
      cpu: 2
    });
    expect(result);
    expect(result.cpu.description).toMatch(
      "DB custom CORE running in EU (with 30% promotional discount)"
    );
    skuToCostPerUnit(result.cpu);
    skuToCostPerUnit(result.memory);
  });
});
