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
import {
  getGcpRegion,
  getAwsRegionByInvoiceCode,
  getAwsRegion
} from "../src/aws/Regions";
import { setOptions } from "../src/core/config";

describe("Regions", function() {
  before(() => {
    setOptions();
  });

  it("getAwsRegion", () => {
    expect(getAwsRegion("eu-central-1")).toMatchObject({
      code: "EUC1"
    });
    expect(getAwsRegionByInvoiceCode("EUC1")).toMatchObject({
      code: "EUC1"
    });
    expect(() => getAwsRegion("xxx-yyy")).toThrowError("Region not found: xxx");
    expect(() => getAwsRegionByInvoiceCode("xxx-yyy")).toThrowError(
      "Region not found: xxx"
    );
  });
  it("getGcpRegion", () => {
    expect(getGcpRegion("europe-west1")).toBeDefined();
    expect(() => getGcpRegion("xxx")).toThrowError("Unknown GCP region: xxx");
  });
});
