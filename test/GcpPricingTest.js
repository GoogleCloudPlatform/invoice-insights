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

import {
  calculateSudDiscount,
  calculateSharedPricing,
  calculatePricing,
  calculatePremiumOsPricing,
  calculateBlockStoragePricing,
  calculateSqlPricing
} from "../src/GcpPricing";
import { HOURS_IN_A_MONTH } from "../src/util";
import Big from "big-js";
import { getGcpRegion } from "../src/Regions";
import CustomGcpVm from "../src/CustomGcpVm";
import { initGcpStore, getGcpStore } from "../src/GcpStore";
import expect from "expect";

describe("GcpPricing", () => {
  let gcpStore;

  before(async () => {
    await initGcpStore();
    gcpStore = getGcpStore();
  });

  it("calculates SUD", () => {
    expect.extend({
      toMatchSUD(received, argument) {
        const actual = calculateSudDiscount(new Big(received).toString());
        if (actual == argument) {
          return {
            pass: true,
            message: () =>
              `expected ${received} hours not to matchSUD ${argument}`
          };
        } else {
          return {
            pass: false,
            message: () =>
              `expected ${received} hours to apply SUD ${argument} (instead found ${actual})`
          };
        }
      }
    });

    // breakpoints: 182.5, 365, 547.5

    // first week at listed price
    expect(10).toMatchSUD("0");

    // second week at 20% discount
    let firstSegment = 0;
    let secondSegment = 0.2 * (190 - 182.5);
    expect(190).toMatchSUD((firstSegment + secondSegment) / 190);

    // third week at 40% discount
    firstSegment = 0;
    secondSegment = 0.2 * 182.5;
    let thirdSegment = 0.4 * (400 - 365);
    expect(400).toMatchSUD((firstSegment + secondSegment + thirdSegment) / 400);

    // fourth week at 60% discount
    firstSegment = 0;
    secondSegment = 0.2 * 182.5;
    thirdSegment = 0.4 * 182.5;
    let fourthSegment = 0.6 * (600 - 547.5);
    expect(600).toMatchSUD(
      (firstSegment + secondSegment + thirdSegment + fourthSegment) / 600
    );

    // more than a month: divide into entire months (30% each) and apply this calculation to the reminder
    expect(HOURS_IN_A_MONTH).toMatchSUD(0.3);

    const completeMonth = 0.3 * HOURS_IN_A_MONTH;
    const remainder = 0 + 0.2 * (190 - 182.5);
    expect(HOURS_IN_A_MONTH + 190).toMatchSUD(
      (completeMonth + remainder) / (HOURS_IN_A_MONTH + 190)
    );
  });

  describe("get SKUs", () => {
    const region = getGcpRegion("europe-west1");
    function getSkus(name) {
      return gcpStore.getSkusForVm({
        region,
        name
      });
    }

    it("Calculates shared pricing", () => {
      expect(
        calculateSharedPricing(
          "onDemand",
          HOURS_IN_A_MONTH,
          getSkus("f1-micro")["onDemand"]
        )
      ).toEqual({
        hourlyRate: "0.00602",
        monthlyRate: "4.3946",
        detail: {
          sudPct: "0.3",
          cpu: "0.0086"
        }
      });
      expect(
        calculateSharedPricing(
          "preemptible",
          100,
          getSkus("g1-small")["preemptible"]
        )
      ).toEqual({
        hourlyRate: "0.0077",
        monthlyRate: "0.77",
        detail: {
          cpu: "0.0077"
        }
      });
    });

    it("Calculates standard pricing", () => {
      // standard VM: SUD, preemptible, 1yr and 3yr commitment
      function getPricing(usageType) {
        return calculatePricing(
          usageType,
          HOURS_IN_A_MONTH,
          gcpStore.getVmType("n1-standard-2"),
          getSkus("n1-standard-2")[usageType]
        );
      }
      expect(getPricing("onDemand")).toEqual({
        detail: {
          cpu: "0.034773",
          memory: "0.004661",
          sudPct: "0.3"
        },
        hourlyRate: "0.07315245",
        monthlyRate: "53.4012885"
      });
      expect(getPricing("preemptible")).toEqual({
        detail: {
          cpu: "0.007321",
          memory: "0.000981"
        },
        hourlyRate: "0.0219995",
        monthlyRate: "16.059635"
      });
      expect(getPricing("commit1Yr")).toMatchObject({
        hourlyRate: "0.065834"
      });
      expect(getPricing("commit3Yr")).toMatchObject({
        hourlyRate: "0.0470235"
      });
    });
    it("Calculates custom VM pricing", () => {
      const instance = new CustomGcpVm({
        cpu: 2,
        memory: 200
      });

      expect(instance).toEqual({
        // 187 Gb extended memory
        extendedMemoryMb: 191488,
        guestCpus: 2,
        memoryMb: 13312,
        name: "custom"
      });

      function getPricing(usageType) {
        return calculatePricing(
          usageType,
          HOURS_IN_A_MONTH,
          instance,
          getSkus("custom")[usageType]
        );
      }

      expect(getPricing("onDemand")).toEqual({
        detail: {
          cpu: "0.036489",
          extendedMemory: "0.010506",
          memory: "0.004892",
          sudPct: "0.3"
        },
        hourlyRate: "1.4708372",
        monthlyRate: "1073.711156"
      });
      expect(getPricing("preemptible")).toEqual({
        detail: {
          cpu: "0.00768",
          extendedMemory: "0.002212",
          memory: "0.00103"
        },
        hourlyRate: "0.442394",
        monthlyRate: "322.94762"
      });
      expect(getPricing("commit1Yr")).toEqual({
        hourlyRate: "0.065834",
        detail: {
          cpu: "0.021907",
          extendedMemory: "0.010506",
          extendedMemorySudPct: "0.3",
          memory: "0.002936"
        },
        hourlyRate: "1.4572174",
        monthlyRate: "1063.768702"
      });
      expect(getPricing("commit3Yr")).toEqual({
        detail: {
          extendedMemorySudPct: "0.3",
          cpu: "0.015648",
          extendedMemory: "0.010506",
          memory: "0.002097"
        },
        hourlyRate: "1.4337924",
        monthlyRate: "1046.668452"
      });
    });

    it("Calculates memory-optimized pricing", () => {
      function getPricing(usageType, name) {
        const sku = getSkus("n1-ultramem-80")[usageType];

        return calculatePricing(
          usageType,
          HOURS_IN_A_MONTH,
          gcpStore.getVmType("n1-ultramem-80"),
          sku
        );
      }
      expect(getPricing("onDemand")).toEqual({
        detail: {
          cpu: "0.03831345",
          memory: "0.0056258",
          sudPct: "0.3"
        },
        hourlyRate: "9.71450452",
        monthlyRate: "7091.5882996"
      });
      expect(getPricing("preemptible")).toEqual({
        detail: {
          cpu: "0.00806",
          memory: "0.00118"
        },
        hourlyRate: "2.91276",
        monthlyRate: "2126.3148"
      });
      expect(getPricing("commit1Yr")).toEqual({
        detail: {
          cpu: "0.0226",
          memory: "0.00332"
        },
        hourlyRate: "8.18904",
        monthlyRate: "5977.9992"
      });
      expect(getPricing("commit3Yr")).toEqual({
        detail: {
          cpu: "0.01149",
          memory: "0.00169"
        },
        hourlyRate: "4.16738",
        monthlyRate: "3042.1874"
      });
    });

    it("Includes premium OS pricing in the result", () => {
      function getPricing(usageType) {
        return calculatePricing(
          usageType,
          HOURS_IN_A_MONTH,
          gcpStore.getVmType("n1-standard-2"),
          getSkus("n1-standard-2")[usageType],
          new Big(1)
        );
      }

      // just check that the OS cost is included in the result
      expect(getPricing("onDemand")).toEqual({
        detail: {
          cpu: "0.034773",
          memory: "0.004661",
          sudPct: "0.3",
          osHourly: "1",
          osMonthly: "730"
        },
        hourlyRate: "1.07315245",
        monthlyRate: "783.4012885"
      });
    });
  });

  it("Calculates Premium OS pricing", () => {
    function osPricing(os, vmType) {
      return calculatePremiumOsPricing(
        os,
        gcpStore.getVmType(vmType)
      ).toString();
    }
    expect(osPricing("Windows", "f1-micro")).toMatch("0.02");
    expect(osPricing("Windows", "g1-small")).toMatch("0.02");
    expect(osPricing("Windows", "n1-standard-2")).toMatch("0.08");

    expect(osPricing("RedHat", "f1-micro")).toMatch("0.06");
    expect(osPricing("RedHat", "n1-standard-2")).toMatch("0.06");
    expect(osPricing("RedHat", "n1-standard-8")).toMatch("0.13");

    expect(osPricing("Suse", "f1-micro")).toMatch("0.02");
    expect(osPricing("Suse", "g1-small")).toMatch("0.02");
    expect(osPricing("Suse", "n1-standard-2")).toMatch("0.11");
  });

  it("Calculates storage pricing", () => {
    const region = getGcpRegion("europe-west1");
    const cpsp = function(productId, UsageQuantity) {
      return calculateBlockStoragePricing(region, productId, UsageQuantity);
    };
    expect(cpsp("SnapshotUsage", "10")).toEqual({
      detail: {
        perGbMonth: "0.026"
      },
      monthlyRate: "0.26",
      name: "snapshot"
    });
    expect(cpsp("VolumeUsage", "10")).toMatchObject({
      monthlyRate: "0.4"
    });
    expect(cpsp("VolumeUsage.st1", "10")).toMatchObject({
      monthlyRate: "0.4"
    });
    expect(cpsp("VolumeUsage.piops", "10")).toMatchObject({
      monthlyRate: "1.7"
    });
    expect(cpsp("VolumeUsage.gp2", "10")).toMatchObject({
      monthlyRate: "1.7"
    });
  });

  describe("calculates Cloud SQL pricing", () => {
    const region = getGcpRegion("europe-west1");
    const getPricing = function(database, ha, name) {
      const skus = gcpStore.getSkusForSql({ region, ha, database, name });
      const gcpVmType =
        name == "custom"
          ? {
              guestCpus: 12,
              memoryMb: 3750
            }
          : gcpStore.getVmType(name);
      return calculateSqlPricing(HOURS_IN_A_MONTH, gcpVmType, skus);
    };

    it("for Postgres", () => {
      // shared core
      expect(getPricing("PostgreSQL", false, "f1-micro")).toEqual({
        monthlyRate: "7.665",
        hourlyRate: "0.0105"
      });

      // shared core with ha
      expect(getPricing("PostgreSQL", true, "g1-small")).toEqual({
        monthlyRate: "51.1",
        hourlyRate: "0.07"
      });

      // standard instance
      expect(getPricing("PostgreSQL", false, "n1-standard-2")).toEqual({
        monthlyRate: "98.623",
        hourlyRate: "0.1351",
        detail: {
          cpu: "0.0413",
          memory: "0.007"
        }
      });

      // standard instance with HA
      expect(getPricing("PostgreSQL", true, "n1-standard-2")).toEqual({
        monthlyRate: "197.246",
        hourlyRate: "0.2702",
        detail: {
          cpu: "0.0413",
          memory: "0.007"
        }
      });
    });

    it("for MySQL", () => {
      // shared core
      expect(getPricing("MySQL", false, "f1-micro")).toEqual({
        monthlyRate: "7.665",
        hourlyRate: "0.0105"
      });

      // shared core with ha
      expect(getPricing("MySQL", true, "g1-small")).toEqual({
        monthlyRate: "51.1",
        hourlyRate: "0.07"
      });

      // standard instance
      expect(getPricing("MySQL", false, "n1-standard-2")).toEqual({
        monthlyRate: "98.623",
        hourlyRate: "0.1351",
        detail: {
          cpu: "0.0413",
          memory: "0.007"
        }
      });

      // standard instance with HA
      expect(getPricing("MySQL", true, "n1-standard-2")).toEqual({
        detail: {
          cpu: "0.0413",
          memory: "0.007"
        },
        hourlyRate: "0.2702",
        monthlyRate: "197.246"
      });

      // an instance that could not be mapped should revert to Postgres
      expect(getPricing("MySQL", false, "custom")).toEqual({
        detail: {
          cpu: "0.0413",
          memory: "0.007"
        },
        hourlyRate: "0.521234765625",
        monthlyRate: "380.50137890625"
      });
    });
  });
});
