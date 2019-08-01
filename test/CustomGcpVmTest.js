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
import CustomGcpVm from "../src/CustomGcpVm";

describe("CustomGcpVm", function() {
  function createInstance(cpu, memory) {
    return new CustomGcpVm({
      cpu,
      memory
    });
  }

  it("matches the spec", () => {
    expect(createInstance(1, 1.1)).toEqual({
      name: "custom",
      guestCpus: 2,
      memoryMb: 1024
    });
    expect(createInstance(4, 8)).toEqual({
      name: "custom",
      guestCpus: 4,
      memoryMb: 8192
    });

    // memory limit excessive, but still under --memory-window
    // uses extendedMemory
    expect(createInstance(4, 650)).toEqual({
      name: "custom",
      guestCpus: 4,
      memoryMb: 26624,
      extendedMemoryMb: 612352
    });
  });
  it("throws exception if not within limits", () => {
    expect(() => createInstance(100, 8)).toThrowError(
      "Maximum number of CPUs for custom VM (96 CPUs) exceeded: 100"
    );
    expect(() => createInstance(16, 800)).toThrowError(
      "Maximum memory size for a custom VM (624 GB) exceeded: 800"
    );
  });
});
