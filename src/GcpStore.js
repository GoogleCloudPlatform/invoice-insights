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

import assert from "assert";
import { readJSON, gbToMb, getGcpSkuDescription, concatTruthy } from "./util";
import SortedArray from "sorted-array";
import CustomGcpVm from "./CustomGcpVm";
import options from "./Options";

function compareVMs(
  { guestCpus: guestCpus1, memoryMb: memoryMb1 },
  { guestCpus: guestCpus2, memoryMb: memoryMb2 }
) {
  return guestCpus1 < guestCpus2
    ? 1
    : guestCpus1 > guestCpus2
    ? -1
    : memoryMb1 > memoryMb2
    ? 1
    : memoryMb1 < memoryMb2
    ? -1
    : 0;
}

/**
 * Store the SKUs and VM types for Google Cloud
 */
class GcpStore {
  constructor(skus, vmTypes) {
    this.skusByRegion = {};
    this.skus = skus;
    this.vmTypes = vmTypes;
    this.skuCache = {};
    const vmTypesByRegion = (this.vmTypesByRegion = {});
    const vmTypesByName = (this.vmTypesByName = {});

    vmTypes.forEach(entry => {
      const { name, zone, guestCpus } = entry;
      const [region] = /[^\-]+\-[^\-]+/.exec(zone);
      // not sure if this will be needed
      if (!vmTypesByName[name]) {
        vmTypesByName[name] = entry;
      }
      // accumulate data by zone, then CPU number
      let regionData = vmTypesByRegion[region];
      if (!regionData) {
        regionData = vmTypesByRegion[region] = {
          // VM types sorted by CPU (key is # of CPUs)
          // each value is an array of VM Types, sorted asc by memory size
          vmsByCpu: {},
          // names of VMs supported in this region
          vmsSupported: new Set()
        };
      }

      // each VM type can be included for more than one zone
      if (!regionData.vmsSupported.has(name)) {
        regionData.vmsSupported.add(name);
        let vmsByCpu = regionData.vmsByCpu["" + guestCpus];
        if (!vmsByCpu) {
          vmsByCpu = regionData.vmsByCpu["" + guestCpus] = new SortedArray(
            [],
            compareVMs
          );
        }
        vmsByCpu.insert(entry);
      }
    });
  }

  getSkusByRegion(regionId) {
    let result = this.skusByRegion[regionId];
    if (!result) {
      result = this.skusByRegion[regionId] = this.skus.filter(
        ({ serviceRegions }) => serviceRegions.includes(regionId)
      );
    }
    return result;
  }

  getVmType(type) {
    const vmType = this.vmTypesByName[type];
    assert(!!vmType, `GCP VM type not found: ${type}`);
    return vmType;
  }

  // Search for the closest VM to a given spec, undefined otherwise
  // the CPU number must be an exact match, the memory must be a percentage defined by memoryMatch
  // Careful: memory is received as GiB, but returned as MiB
  guessVmType({ region, name, cpus: expectedCPUs, memory }) {
    // respect configured map-instances
    const mappedInstanceId = options.mappedInstances[name];
    if (mappedInstanceId) {
      return this.getVmType(mappedInstanceId);
    }

    const expectedMemory = gbToMb(memory);
    const memoryDiff = expectedMemory * options.memoryWindow;
    const vmsByCpu = this.vmTypesByRegion[region.gcp.id].vmsByCpu;
    const vms = vmsByCpu["" + expectedCPUs];
    const result =
      vms &&
      vms.array.find(({ memoryMb }) => {
        return (
          expectedMemory - memoryDiff <= memoryMb &&
          expectedMemory + memoryDiff >= memoryMb
        );
      });
    return (
      result ||
      new CustomGcpVm({
        cpu: expectedCPUs,
        memory
      })
    );
  }

  getSkusForVm({ region, name }) {
    const key = `${region.gcp.id}-${name}`;
    let result = this.skuCache[key];
    if (!result) {
      result = this.skuCache[key] = this._getSkusForVm({ region, name });
    }
    return result;
  }

  getSkusForSql({ region, ha, database, name }) {
    const regionId = region.gcp.id;
    const sharedCore = name == "f1-micro" || name == "g1-small";
    const type = sharedCore ? "shared" : "dedicated";

    const getInstanceSkuName = name => {
      if (name == "f1-micro") {
        return "generic Micro instance with burstable CPU";
      }
      if (name == "g1-small") {
        return "generic Small instance with 1 VCPU";
      }
      throw new Error(`Unsupported Cloud SQL instance name: ${name}`);
    };

    const findSku = skuName => {
      // The DB-specific SKUs for Postgres and MySQL are empty. We use the generic "DB xxx" SKU.
      // For HA, this value should be multiplied by two
      return this.findSkusByDescription(regionId, `DB ${skuName}`);
    };

    // pricing per instance
    if (sharedCore) {
      return {
        type,
        ha,
        database,
        onDemand: findSku(getInstanceSkuName(name))
      };
    }

    // pricing per core and memory
    return {
      type: "dedicated",
      ha,
      database,
      cpu: findSku("custom CORE"),
      memory: findSku("custom RAM")
    };
  }

  _getSkusForVm({ region, name }) {
    const regionId = region.gcp.id;
    const isCustom = name === "custom";

    const findSku = (description, usageType) => {
      return this.findSkusByDescription(
        regionId,
        description,
        sku => sku.category.usageType === usageType
      );
    };

    // shared core instances follow a different structure
    if (name == "f1-micro" || name == "g1-small") {
      const description =
        name == "f1-micro"
          ? "Micro Instance with burstable CPU"
          : "Small Instance with 1 VCPU";
      return {
        type: "shared",
        onDemand: findSku(description, "OnDemand"),
        preemptible: findSku("Preemptible " + description, "Preemptible")
      };
    }

    const onDemandCpuDesc = getGcpSkuDescription({
      name,
      resourceType: "Core"
    });
    const onDemandRamDesc = getGcpSkuDescription({
      name,
      resourceType: "Ram"
    });
    const onDemandExtendedRamDesc =
      isCustom &&
      getGcpSkuDescription({
        name,
        resourceType: "Ram",
        extended: true
      });
    const preemptibleCpuDesc = getGcpSkuDescription({
      name,
      resourceType: "Core",
      preemptible: true
    });
    const preemptibleRamDesc = getGcpSkuDescription({
      name,
      resourceType: "Ram",
      preemptible: true
    });
    const preemptibleExtendedRamDesc =
      isCustom &&
      getGcpSkuDescription({
        name,
        resourceType: "Ram",
        extended: true,
        preemptible: true
      });
    const committedCpuDesc = getGcpSkuDescription({
      committed: true,
      name,
      resourceType: "Cpu"
    });
    const committedRamDesc = getGcpSkuDescription({
      committed: true,
      name,
      resourceType: "Ram"
    });

    const extendedMemoryOnDemandSku =
      isCustom && findSku(onDemandExtendedRamDesc, "OnDemand");
    return {
      type: isCustom ? "custom" : "predefined",
      onDemand: {
        cpu: findSku(onDemandCpuDesc, "OnDemand"),
        memory: findSku(onDemandRamDesc, "OnDemand"),
        extendedMemory: extendedMemoryOnDemandSku
      },
      preemptible: {
        cpu: findSku(preemptibleCpuDesc, "Preemptible"),
        memory: findSku(preemptibleRamDesc, "Preemptible"),
        extendedMemory:
          isCustom && findSku(preemptibleExtendedRamDesc, "Preemptible")
      },
      commit1Yr: {
        cpu: findSku(committedCpuDesc, "Commit1Yr"),
        memory: findSku(committedRamDesc, "Commit1Yr"),
        // extended memory is not included in the commitment
        extendedMemory: extendedMemoryOnDemandSku
      },
      commit3Yr: {
        cpu: findSku(committedCpuDesc, "Commit3Yr"),
        memory: findSku(committedRamDesc, "Commit3Yr"),
        // extended memory is not included in the commitment
        extendedMemory: extendedMemoryOnDemandSku
      }
    };
  }

  findSkusByDescription(regionId, description, callback = sku => true) {
    const skus = this.getSkusByRegion(regionId);

    const result = skus.filter(sku => {
      return sku.description.startsWith(description) && callback(sku);
    });
    assert(!!result.length, `No SKUs found for '${description}'`);
    assert(
      result.length == 1,
      `Multiple SKUs found for '${description}':\n` +
        result.map(({ description }) => description).join("\n")
    );
    return result[0];
  }

  // os: One of Windows, RedHat or Suse
  getSkusForPremiumOs(os) {
    if (!this.premiumOS) {
      const winPrefix =
        "Licensing Fee for Windows Server 2012 R2 Datacenter Edition";
      const rhelPrefix = "Licensing Fee for RedHat Enterprise Linux 8";
      const susePrefix = "Licensing Fee for SUSE Linux Enterprise Server 15";
      this.premiumOS = {
        Windows: {
          "f1-micro": this.findSkusByDescription(
            "global",
            `${winPrefix} on f1-micro`
          ),
          "g1-small": this.findSkusByDescription(
            "global",
            `${winPrefix} on g1-small`
          ),
          perCpu: this.findSkusByDescription(
            "global",
            `${winPrefix} (CPU cost)`
          )
        },
        RedHat: {
          "1-4cpu": this.findSkusByDescription(
            "global",
            `${rhelPrefix} on VM with 1 to 4 VCPU`
          ),
          ">5cpu": this.findSkusByDescription(
            "global",
            `${rhelPrefix} on VM with 6 or more VCPU`
          )
        },
        Suse: {
          "f1-micro": this.findSkusByDescription(
            "global",
            `${susePrefix} on f1-micro`
          ),
          "g1-small": this.findSkusByDescription(
            "global",
            `${susePrefix} on g1-small`
          ),
          perVm: this.findSkusByDescription(
            "global",
            `${susePrefix} (CPU cost)`
          )
        }
      };

      // todo: SQL Server
    }
    const result = this.premiumOS[os];
    assert(!!result, `Premium OS not found: ${os}`);
    return result;
  }
}

let store;
export function getGcpStore() {
  assert(!!store, "GCP Store not yet initialized. Please call initGcpStore()");
  return store;
}

export async function initGcpStore() {
  if (!store) {
    const [skus, vmTypes] = await Promise.all([
      readJSON("./assets/gcp-skus.json"),
      readJSON("./assets/gcp-vm-types.json")
    ]);
    store = new GcpStore(skus, vmTypes);
  }
}

export function guessGcpVmType(data) {
  return store.guessVmType(data);
}
