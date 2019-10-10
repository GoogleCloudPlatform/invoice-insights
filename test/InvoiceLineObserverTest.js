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

import expect from "expect";
import InvoiceLineObserver from "../src/aws/InvoiceLineObserver";
import { setOptions } from "../src/core/config";

describe("InvoiceLineObserver", function() {
  before(() => {
    setOptions();
  });

  it("should handle missing fields", () => {
    const observer = new InvoiceLineObserver();
    function addStats(
      productCategoryId,
      usageTypeId,
      productId,
      UsageQuantity
    ) {
      // all fields present
      observer.observe({
        key: {
          usageTypeId,
          productId
        },
        row: {
          ProductCode: productCategoryId,
          UsageQuantity: UsageQuantity,
          TotalCost: "0"
        }
      });
    }

    // all fields
    addStats("foo", "bar", "baz", "1");

    // missing productId
    addStats("foo", "bar", undefined, "1");

    // maybe add toMatchSnapsht if this becomes problematic
    expect(JSON.stringify(observer.stats)).toMatch(
      '{"foo":{"bar":{"baz":{"UsageQuantity":"1","TotalCost":"0"},"default":{"UsageQuantity":"1","TotalCost":"0"}}}}'
    );
  });
  it("should accumulate storage data", () => {
    const observer = new InvoiceLineObserver();
    function addStorage(productId, UsageQuantity, TotalCost) {
      observer.addStorageEntry({
        regionId: "EUC1",
        productId,
        UsageQuantity,
        TotalCost
      });
    }
    addStorage("foo", "1", "5");
    addStorage("foo", "1", "5");
    addStorage("bar", "2", "3");
    expect(JSON.parse(JSON.stringify(observer.storage))).toEqual({
      EUC1: {
        bar: {
          TotalCost: "3",
          UsageQuantity: "2"
        },
        foo: {
          TotalCost: "10",
          UsageQuantity: "2"
        }
      }
    });
  });
});
