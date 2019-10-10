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
import { gbToMb } from "../core/util";
import { options } from "../core/config";

const MAX_CPU = 96;
const MAX_MEMORY = 624;

// received: memory in Gb
// returns: memory in Mb, closest multiple of 256
function normalizeMemory(memoryGb) {
  return parseInt(gbToMb(memoryGb) / 256) * 256;
}

/**
 * Store the configuration of a custom VM
 */
export default class CustomGcpVm {
  constructor({ cpu, memory }) {
    assert(
      cpu <= MAX_CPU,
      `Maximum number of CPUs for custom VM (${MAX_CPU} CPUs) exceeded: ${cpu}`
    );
    assert(
      memory <= MAX_MEMORY * (1 + options.memoryWindow),
      `Maximum memory size for a custom VM (${MAX_MEMORY} GB) exceeded: ${memory}`
    );

    this.name = "custom";
    this.guestCpus = cpu % 2 == 0 ? cpu : cpu + 1;

    memory = Math.min(memory, MAX_MEMORY);
    const maxStandardMemory = this.guestCpus * 6.5;
    if (memory <= maxStandardMemory) {
      this.memoryMb = normalizeMemory(memory);
    } else {
      this.memoryMb = normalizeMemory(maxStandardMemory);
      this.extendedMemoryMb = normalizeMemory(memory - maxStandardMemory);
    }
  }
}
