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

const regionsByAwsInvoiceCode = {};
const regionsByAwsId = {};
export const regionsByGcpId = {};

function createRegion(
  code,
  awsRegion,
  awsRegionName,
  gcpRegion,
  gcpRegionName
) {
  regionsByAwsInvoiceCode[code] = regionsByAwsId[awsRegion] = regionsByGcpId[
    gcpRegion
  ] = {
    code,
    aws: {
      id: awsRegion,
      name: awsRegionName
    },
    gcp: {
      id: gcpRegion,
      name: gcpRegionName
    }
  };
}

//
// The following was composed from the following sources
//
// AWS Invoice codes:
// https://docs.aws.amazon.com/sdkfornet/v3/apidocs/items/S3/TS3Region.html
//
// AWS physical location:
// https://docs.aws.amazon.com/general/latest/gr/rande.html
//
// GCP regions
// https://cloud.google.com/compute/docs/regions-zones/
//
// Many Bothans died to bring us this information.
//
createRegion(
  "USE1",
  "us-east-1",
  "US East (N. Virginia)",
  "us-east1",
  "Moncks Corner, South Carolina, USA"
);
createRegion(
  "USE2",
  "us-east-2",
  "US East (Ohio)",
  "us-central1",
  "Council Bluffs, Iowa, USA"
);
createRegion(
  "USW1",
  "us-west-1",
  "US West (N. California)",
  "us-west1",
  "The Dalles, Oregon, USA"
);
createRegion(
  "USW2",
  "us-west-2",
  "US West (Oregon)",
  "us-west1",
  "The Dalles, Oregon, USA"
);
createRegion(
  "CAN1",
  "ca-central-1",
  "Canada (Central)",
  "northamerica-northeast1",
  "Montréal, Québec, Canada"
);
createRegion(
  "EUC1",
  "eu-central-1",
  "EU (Frankfurt)",
  "europe-west3",
  "Frankfurt, Germany"
);
createRegion(
  "EU",
  "eu-west-1",
  "EU (Ireland)",
  "europe-west1",
  "St. Ghislain, Belgium"
);
createRegion(
  "EUW1",
  "eu-west-1",
  "EU (Ireland)",
  "europe-west1",
  "St. Ghislain, Belgium"
);
createRegion(
  "EUW2",
  "eu-west-2",
  "EU (London)",
  "europe-west2",
  "London, England, UK"
);
createRegion(
  "EUW3",
  "eu-west-3",
  "EU (Paris)",
  "europe-west4",
  "Eemshaven, Netherlands"
);
createRegion(
  "APN1",
  "ap-northeast-1",
  "Asia Pacific (Tokyo)",
  "asia-northeast1",
  "Tokyo, Japan"
);
createRegion(
  "APN2",
  "ap-northeast-2",
  "Asia Pacific (Seoul)",
  "asia-northeast2",
  "Osaka, Japan"
);
createRegion(
  "APS1",
  "ap-southeast-1",
  "Asia Pacific (Singapore)",
  "asia-southeast1",
  "Jurong West, Singapore"
);
createRegion(
  "APS2",
  "ap-southeast-2",
  "Asia Pacific (Sydney)",
  "australia-southeast1",
  "Sydney, Australia"
);
createRegion(
  "APS3",
  "ap-south-1",
  "Asia Pacific (Mumbai)",
  "asia-south1",
  "Mumbai, India"
);
createRegion(
  "SAE1",
  "sa-east-1",
  "South America (São Paulo)",
  "southamerica-east1",
  "São Paulo, Brazil"
);

/*
todo: 
UGW1 GovCloud -us
*/

export const RegionCodeRegEx = `(${Object.keys(regionsByAwsInvoiceCode).join(
  "|"
)})`;

export function getGcpRegion(id) {
  const region = regionsByGcpId[id];
  assert(!!region, `Unknown GCP region: ${id}`);
  return region;
}

export function getAwsRegionByInvoiceCode(code) {
  const region = regionsByAwsInvoiceCode[code];
  assert(!!region, `Region not found: ${code}`);
  return region;
}

export function getAwsRegion(id) {
  const region = regionsByAwsId[id];
  assert(!!region, `Region not found: ${id}`);
  return region;
}
