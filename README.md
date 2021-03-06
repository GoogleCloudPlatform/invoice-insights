# Invoice Insights

This command line tool will analyze the invoice from a cloud provider and create a report with the total usage and cost, including the equivalent products and cost on GCP. We take the invoice CSV as input, and generate an ascii table or a CSV file with the information extracted.

This tool requires [nodejs](https://nodejs.org/en/).

**DISCLAIMER**: This is not an officially supported Google product.

## Processing the invoice

Only the AWS invoice is supported at this time. Invoice Insights can process the following services from the invoice:

- **AWS Regions** and **VM types**.
- **Premium OS**: Windows, Red Hat and Suse
- **Block Storage**: `sc1`, `st1`, `gp2` and `io1`
- **RDS Instance Hours**
- **Elasticache Instance Hours**

## Translating into Google Cloud

Invoice Insights can translate to the following services on Google Cloud:

- **VM types**: standard VMs (incl. high memory and high CPU), memory-optimized, custom (incl. extended memory), shared core (`f1-micro` and `g1-small`).
- **Usage type**: on demand, preemptible, commit 1 year, commit 3 year
- **Premium OS**: Windows, Red Hat and Suse
- **Block storage**: Standard and SSD
- **Cloud SQL instances**
- **Memorystore instances**

## Feature Roadmap

The following is a list of to-do features in the roadmap:

- **Local SSDs** and **GPUs** are included in the report, but not automatically mapped to GCP yet.
- **RDS Storage**, **Aurora Storage** and **RDS Snapshots**. You can extract those from the Summary.
- **Network egress** report. You can extract that from the Summary.
- **S3 storage report** (operations and Gb/month). You can extract that from the Summary.
- **SAP Premium OS** (Red Hat and Suse)
- **SQL Server instances**
- **Elasticache snapshots**

## Getting started

```sh
# Get high-level summary from an AWS invoice
npx @google-cloud/invoice-insights summary invoice.csv

# Get VM stats and GCP equivalent
npx @google-cloud/invoice-insights instances invoice.csv --format csv

# Print mappings with debug information, rounding to months, overriding a region mapping
npx @google-cloud/invoice-insights instances invoice.csv --debug --roundMonths --mapRegion eu-central-1=europe-west1
```

## Mapping to instances on GCP

We search for a VM with the same number of CPUs and a difference in memory below the predefined memory window (10% by default). If there is no match, a custom VM will be used instead.

Shared core (`t2` instances on AWS) will be mapped to `f1-micro` and `g1-small` on GCP when possible, or to a standard VM otherwise. Instance mappings can be overriden with `--mapInstance`, and region mapping with `--mapRegion`. These arguments can receive multiple values.

```bash
npx @google-cloud/invoice-insights invoice.csv --mapInstance t2.nano=n1-standard1 --mapInstance t2.micro=n1-standard2 --mapRegion eu-central-1=europe-west1
```

When calculating SUDs, we assume that VMs are running 730 hours per month (100% of the time) where possible. This is used to estimate the number of concurrent instances.

## Exporting your invoice from AWS

If pricing details are considered sensitive information, filter out these columns when creating the invoice export from AWS:

- `BlendedRate`
- `CurrencyCode`
- `CostBeforeTax`
- `Credits`
- `TaxAmount`
- `TaxType`
- `TotalCost`

## Contributing

Pull Requests are welcome! If you are planning to work on this code, this is what you need to get started.

First, install the [Google Cloud SDK](https://cloud.google.com/sdk/) and [jq](https://stedolan.github.io/jq/) (`sudo apt install jq`). Once done, you may want to update the local information about pricing and VM types.

```bash
# Download the latest SKUs and VM sizes
bin/get-aws-skus
bin/get-gcp-skus
bin/get-gcp-vm-types

# Test that the downloaded files are well-formed JSON
npx jsonlint third_party/ec2instances.info/aws-skus.json
npx jsonlint assets/gcp-skus.json
npx jsonlint assets/gcp-vm-types.json

# Run the tests: (add --watch to keep watching)
npx mocha -r esm
```

To explore the SKUs manually:

```bash
# Find all SKUs for RAM and memory on Google Cloud
grep 'Ram running in' assets/gcp-skus.json | sort | uniq -u
grep 'Core running in' assets/gcp-skus.json | sort | uniq -u

# Find all SKUs for commitment 1yr
cat assets/gcp-skus.json | jq '.[] | select(.category.usageType=="Commit1Yr") | .description' | sort | uniq -u

# Find all Cloud SQL SKUs
cat assets/gcp-skus.json | jq '.[] | select(.category.serviceDisplayName=="Cloud SQL" and (.description | contains("Network") | not ) ) | .description' | sort | uniq -u

# Find all SKUs with more than one pricing tier (for example f1-micro is free the first 730 hours)
cat assets/gcp-skus.json | jq '.[] | select(.pricingInfo[].pricingExpression.tieredRates | length > 1) | .description'|sort |uniq -u
```
