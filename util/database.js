const fs = require("fs");
const path = require("path");
const jsoning = require("jsoning");
const { MongoClient } = require("mongodb");

class Database {
  constructor({
    mongoUri = null,
    databaseName = "musicdb",
    collectionName = "settings",
    legacyPath = path.join(__dirname, "..", "data", "db.json"),
  } = {}) {
    this.mongoUri = mongoUri?.trim() || null;
    this.databaseName = databaseName;
    this.collectionName = collectionName;
    this.legacyPath = legacyPath;
    this.driver = null;
    this.client = null;
    this.collection = null;
    this.legacyDatabase = null;
  }

  async initialize() {
    if (this.driver) return;

    if (!this.mongoUri) {
      this.legacyDatabase = new jsoning(this.legacyPath);
      this.driver = "json";
      console.warn(
        "[DATABASE] mongoURI is not set in config.js; using the legacy local JSON database."
      );
      return;
    }

    this.client = new MongoClient(this.mongoUri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
      retryReads: true,
      retryWrites: true,
    });

    try {
      await this.client.connect();
      this.collection = this.client
        .db(this.databaseName)
        .collection(this.collectionName);
      this.driver = "mongodb";
      await this.migrateLegacyJson();
      console.log(
        `[DATABASE] MongoDB connected (${this.databaseName}.${this.collectionName}).`
      );
    } catch (error) {
      await this.client.close().catch(() => {});
      this.client = null;
      this.collection = null;
      throw new Error(`Unable to connect to MongoDB: ${error.message}`);
    }
  }

  async get(key) {
    this.ensureInitialized();
    if (this.driver === "json") return this.legacyDatabase.get(key);

    const setting = await this.collection.findOne(
      {
        _id: key,
      },
      {
        projection: {
          value: 1,
        },
      }
    );
    return setting?.value;
  }

  async set(key, value) {
    this.ensureInitialized();
    if (this.driver === "json") return this.legacyDatabase.set(key, value);

    await this.collection.updateOne(
      {
        _id: key,
      },
      {
        $set: {
          value,
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
      }
    );
    return value;
  }

  async close() {
    if (this.client) await this.client.close();
    this.driver = null;
    this.client = null;
    this.collection = null;
    this.legacyDatabase = null;
  }

  ensureInitialized() {
    if (!this.driver) throw new Error("Database is not initialized.");
  }

  async migrateLegacyJson() {
    if (!fs.existsSync(this.legacyPath)) return;

    const existingSettings = await this.collection.estimatedDocumentCount();
    if (existingSettings > 0) return;

    try {
      const legacySettings = JSON.parse(
        fs.readFileSync(this.legacyPath, "utf8")
      );
      if (
        !legacySettings ||
        Array.isArray(legacySettings) ||
        typeof legacySettings !== "object"
      )
        return;

      const operations = Object.entries(legacySettings).map(([key, value]) => ({
        updateOne: {
          filter: {
            _id: key,
          },
          update: {
            $set: {
              value,
              updatedAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      if (operations.length === 0) return;
      await this.collection.bulkWrite(operations, {
        ordered: false,
      });
      console.log(
        `[DATABASE] Imported ${operations.length} legacy JSON setting(s) into MongoDB.`
      );
    } catch (error) {
      console.warn(
        `[DATABASE] Legacy JSON migration skipped: ${error.message}`
      );
    }
  }
}

module.exports = Database;
