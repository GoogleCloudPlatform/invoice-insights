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

import { getAwsStore, initAwsStore } from "../src/aws/AwsStore";
import expect from "expect";
import { setOptions } from "../src/core/config";

describe("AwsStore", function() {
  let store;

  before(async () => {
    setOptions();
    await initAwsStore();
    store = getAwsStore();
  });

  it("should parse the AWS instance types", () => {
    expect(store.skus).toBeDefined();
    expect(store.getVmType("m4.large")).toBeDefined();
  });
});
