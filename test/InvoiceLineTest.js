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
  extractOS,
  awsDatabaseToGcp,
  extractAwsDatabaseName
} from "../src/aws/InvoiceLine";
import { getGcpStore, initGcpStore } from "../src/gcp/GcpStore";
import { setOptions } from "../src/core/config";

describe("InvoiceLine", function() {
  let gcpStore;

  before(async () => {
    setOptions();
    await initGcpStore();
    gcpStore = getGcpStore();
  });

  it("extracts the premium OS name from the AWS ItemDescription", () => {
    expect(
      extractOS("$1.0082 per On Demand Windows r4.2xlarge Instance Hour")
    ).toMatch("Windows");
    expect(
      extractOS("$1.4104 per On Demand RHEL r4.4xlarge Instance Hour")
    ).toMatch("RedHat");
    expect(
      extractOS("$0.34 per On Demand SUSE m4.xlarge Instance Hour")
    ).toMatch("Suse");
    expect(
      extractOS("$0.0134 per On Demand Linux t2.micro Instance Hour")
    ).toBeUndefined();
  });

  it("extracts the Database name from the AWS ItemDescription", () => {
    function extractDatabase(ItemDescription) {
      return awsDatabaseToGcp(extractAwsDatabaseName(ItemDescription));
    }
    expect(
      extractDatabase(
        "$1.668 per RDS db.m4.2xlarge Multi-AZ instance hour (or partial hour) running MariaDB"
      )
    ).toMatch("MySQL");
    expect(() => extractDatabase("xxx")).toThrowError(
      "Cannot find a recognized database name in: xxx"
    );
  });
});
