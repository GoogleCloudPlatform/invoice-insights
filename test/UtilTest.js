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
  parseUsageType,
  getGcpVmTypeDescription,
  getGcpSkuDescription
} from "../src/util";

describe("Util", function() {
  it("parseUsageType should parse normal and crazy cases", () => {
    // complete ID: expected format from a VM
    expect(
      parseUsageType("Amazon Elastic Compute Cloud", "EUC1-BoxUsage:t2.micro")
    ).toMatchObject({
      regionId: "EUC1",
      usageTypeId: "BoxUsage",
      productId: "t2.micro"
    });

    // different stuff, same format
    expect(
      parseUsageType("AmazonCloudWatch", "EUC1-CW:AlarmMonitorUsage")
    ).toMatchObject({
      regionId: "EUC1",
      usageTypeId: "CW",
      productId: "AlarmMonitorUsage"
    });

    // missing region, assume us-east
    expect(
      parseUsageType("Amazon Elastic Compute Cloud", "BoxUsage:t2.micro")
    ).toMatchObject({
      regionId: "USE1",
      usageTypeId: "BoxUsage",
      productId: "t2.micro"
    });

    // missing productId
    expect(
      parseUsageType("AWS Data Transfer", "EUC1-DataTransfer-In-Bytes")
    ).toMatchObject({
      regionId: "EUC1",
      usageTypeId: "DataTransfer-In-Bytes",
      productId: undefined
    });

    //
    // Weird shenanigans start here
    //

    // missing productId and regionId
    expect(parseUsageType("Amazon Route 53", "DNS-Queries")).toMatchObject({
      usageTypeId: "DNS-Queries"
    });

    // S3, that's not a region
    expect(
      parseUsageType("Amazon Simple Storage Service", "Requests-Tier2")
    ).toMatchObject({
      usageTypeId: "Requests-Tier2"
    });

    // KMS uses region IDs instead of invoice codes
    expect(
      parseUsageType("AWS Key Management Service", "eu-central-1-KMS-Requests")
    ).toMatchObject({
      regionId: "EUC1",
      usageTypeId: "Requests"
    });

    // CloudFront does his own thing
    expect(
      parseUsageType("Amazon CloudFront", "JP-Requests-Tier2-HTTPS")
    ).toMatchObject({
      usageTypeId: "JP",
      productId: "Requests-Tier2-HTTPS"
    });

    // QuickSight adds QS
    expect(
      parseUsageType("Amazon QuickSight", "QS-User-Standard-Free-Tier")
    ).toMatchObject({
      usageTypeId: "QS-User-Standard-Free-Tier"
    });
    expect(
      parseUsageType("Amazon QuickSight", "EU-QS-Enterprise-SPICE")
    ).toMatchObject({
      regionId: "EU",
      usageTypeId: "QS-Enterprise-SPICE"
    });

    // AWS Data Pipeline
    expect(
      parseUsageType("AWS Data Pipeline", "AWS-Activities-freq")
    ).toMatchObject({
      regionId: "USE1",
      usageTypeId: "AWS-Activities-freq"
    });
    expect(
      parseUsageType("AWS Data Pipeline", "EU-InactivePipelines")
    ).toMatchObject({
      regionId: "EU",
      usageTypeId: "InactivePipelines"
    });
  });

  it("getGcpVmDescription", () => {
    expect(getGcpVmTypeDescription("n1-standard-2")).toMatch("N1 Predefined");
    expect(getGcpVmTypeDescription("n1-ultramem-80")).toMatch(
      "Memory-optimized"
    );
  });

  it("getGcpSkuDescription", () => {
    expect(
      getGcpSkuDescription({
        name: "n1-standard-2",
        resourceType: "Core"
      })
    ).toMatch("N1 Predefined Instance Core");

    expect(
      getGcpSkuDescription({
        preemptible: true,
        name: "custom",
        resourceType: "Ram",
        extended: true
      })
    ).toMatch("Preemptible Custom Extended Instance Ram");

    expect(
      getGcpSkuDescription({
        preemptible: true,
        name: "custom",
        resourceType: "Ram",
        extended: true
      })
    ).toMatch("Preemptible Custom Extended Instance Ram");

    expect(
      getGcpSkuDescription({
        committed: true,
        name: "n1-standard-2",
        resourceType: "Ram"
      })
    ).toMatch("Commitment v1: Ram");

    expect(
      getGcpSkuDescription({
        committed: true,
        name: "n1-ultramem-80",
        resourceType: "Cpu"
      })
    ).toMatch("Commitment v1: Memory-optimized Cpu");
  });
});
