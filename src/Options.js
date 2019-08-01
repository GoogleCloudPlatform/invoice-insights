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

import { getGcpRegion, getAwsRegion } from "./Regions";

/**
 * Global configuration options. See docs for each value in main.js.
 */
class Options {
  constructor(options) {
    Object.assign(this, options);
  }

  setFormat(f) {
    if (f && f !== "table" && f !== "csv") {
      console.error(
        `Invalid value for format. Valid values: csv,table. Current value: ${format}`
      );
      process.exit(1);
    }
    this.format = f;
  }

  setMemoryWindow(em) {
    const memoryWindow = (options.memoryWindow = parseFloat(em));
    if (isNaN(memoryWindow)) {
      console.error(
        `Invalid value for error-margin. Please specify a numeric value between 0 and 1`
      );
      process.exit(1);
    }
    if (memoryWindow <= 0 || memoryWindow > 1) {
      console.error(
        `--memory-window must be > 0 and <= 1 (current value: ${memoryWindow})`
      );
      process.exit(1);
    }
  }

  addMappedInstance(values) {
    values.split(",").forEach(v => {
      const [key, value] = v.trim().split("=");
      if (!key || !value) {
        console.error(`Syntax error in --map-instance ${v}`);
        process.exit(1);
      }
      this.mappedInstances[key] = value;
    });
  }

  addMappedRegion(values) {
    values.split(",").forEach(v => {
      const [key, value] = v.trim().split("=");
      if (!key || !value) {
        console.error(`Syntax error in --map-region ${v}`);
        process.exit(1);
      }
      this.mappedRegions[key] = value;

      // check that the GCP region exists
      const gcpRegion = getGcpRegion(value);
      getAwsRegion(key).gcp = gcpRegion.gcp;
    });
  }
}

// see docs for each value in main.js
export default new Options({
  format: "table",
  memoryWindow: 0.1,
  mappedInstances: {
    "x1e.16xlarge": "n1-megamem-96",
    "x1.16xlarge": "n1-megamem-96",
    "x1.32xlarge": "n1-ultramem-80",
    "t2.nano": "f1-micro",
    "t2.micro": "f1-micro",
    "t2.small": "g1-small"
  },
  mappedRegions: {},
  debug: false,
  roundMonths: false
});
