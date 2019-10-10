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

import neatCSV from "neat-csv";
import fse from "mz/fs";
import path from "path";
import assert from "assert";
import { initAwsStore } from "./AwsStore";
import { initGcpStore } from "../gcp/GcpStore";
import { InvoiceLine } from "./InvoiceLine";
import InvoiceLineObserver from "./InvoiceLineObserver";

function wrap(callback) {
  return function(row, index) {
    try {
      return callback(row, index);
    } catch (e) {
      console.error(`Error processing line ${index}`);
      throw e;
    }
  };
}

/**
 * Parse the invoice CSV
 */
class InvoiceParser {
  constructor(rows) {
    this.rows = rows;
    this.processedLines = 0;
  }

  get totalLines() {
    return this.rows.length;
  }

  parse() {
    const observer = new InvoiceLineObserver();
    const lines = this.rows.map(
      wrap(row => {
        const line = new InvoiceLine(row);
        observer.observe(line);
        return line;
      })
    );
    return {
      stats: observer.stats,
      warnings: observer.warnings,
      storage: observer.storage,
      lines
    };
  }
}

export async function parseCSV(f) {
  await Promise.all([initAwsStore(), initGcpStore()]);
  const filename = path.resolve(f);
  assert(fse.existsSync(filename), `File not found: ${filename}`);
  const fileContents = await fse.readFile(filename);
  return new InvoiceParser(await neatCSV(fileContents.toString())).parse();
}
