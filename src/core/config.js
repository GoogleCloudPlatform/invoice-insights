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

import { getGcpRegion, getAwsRegion } from "../aws/Regions";
import assert from "assert";

export const DEFAULT_MAPPED_INSTANCES = {
  "x1e.16xlarge": "n1-megamem-96",
  "x1.16xlarge": "n1-megamem-96",
  "x1.32xlarge": "n1-ultramem-80",
  "t2.nano": "f1-micro",
  "t2.micro": "f1-micro",
  "t2.small": "g1-small"
};

export let options = {};

export function setOptions({
  "map-region": _mapRegion = {},
  "map-instance": _mapInstance = {},
  ...newOptions
} = {}) {
  const { memoryWindow } = newOptions;
  if (typeof memoryWindow !== "undefined") {
    assert(
      !isNaN(memoryWindow) && memoryWindow > 0 && memoryWindow <= 1,
      "Invalid value for --memoryWindow. Please specify a numeric value between 0 and 1"
    );
  }

  // apply region mappings
  Object.entries(_mapRegion).forEach(([key, value]) => {
    const gcpRegion = getGcpRegion(value);
    getAwsRegion(key).gcp = gcpRegion.gcp;
  });

  // add instance mappings on top of the defaults
  const mappedInstances = Object.assign(
    {},
    DEFAULT_MAPPED_INSTANCES,
    _mapInstance
  );

  // set options. We supply default values to be used by test files
  Object.assign(
    options,
    {
      mappedRegions: _mapRegion,
      mappedInstances,
      format: "table",
      memoryWindow: 0.1,
      tier: "basic"
    },
    newOptions
  );
}
