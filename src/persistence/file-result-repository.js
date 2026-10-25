'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PersistenceError } = require('../errors');
const { resultSchema } = require('../domain/result-schema');

const SAFE_KEY = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;

class FileResultRepository {
  constructor(resultsDir) {
    this.resultsDir = resultsDir;
  }

  async read(key) {
    const filePath = this.#pathFor(key);
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const validated = resultSchema.safeParse(parsed);
      if (!validated.success) throw new Error('Stored result did not match its schema');
      return validated.data;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new PersistenceError(error);
    }
  }

  async writeAtomic(key, result) {
    const destination = this.#pathFor(key);
    const temporary = path.join(this.resultsDir, `.${key}.${process.pid}.${randomUUID()}.tmp`);
    try {
      const validated = resultSchema.parse(result);
      await fs.mkdir(this.resultsDir, { recursive: true });
      await fs.writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw new PersistenceError(error);
    }
  }

  #pathFor(key) {
    if (typeof key !== 'string' || !SAFE_KEY.test(key)) throw new PersistenceError(new Error('Unsafe result key'));
    return path.join(this.resultsDir, `${key}.json`);
  }
}

module.exports = { FileResultRepository };
