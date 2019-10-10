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
import { readJSON } from "../core/util";

class VmType {
  constructor(sku) {
    Object.assign(this, sku);
  }
}

/**
 * Store all the VM types and SKUs from AWS
 */
class AwsStore {
  constructor(skus) {
    this.skus = skus;
    this.vmTypes = parseVmTypes(skus);
  }

  getVmTypes() {
    return Object.keys(this.vmTypes);
  }

  getVmType(type) {
    const vm = this.vmTypes[type];
    assert(!!vm, `Could not find AWS vmType ${type}`);
    return vm;
  }
}

function parseVmTypes(skus) {
  const vmTypes = {};
  skus.forEach(sku => {
    vmTypes[sku.instance_type] = new VmType(sku);
  });
  return vmTypes;
}

let store;
export function getAwsStore() {
  assert(!!store, "AWS Store not yet initialized. Please call initAwsStore()");
  return store;
}

export async function initAwsStore() {
  if (!store) {
    const skus = await readJSON(
      "../third_party/ec2instances.info/aws-skus.json"
    );
    store = new AwsStore(skus);
  }
}

export function getAwsVmType(type) {
  return store.getVmType(type);
}
