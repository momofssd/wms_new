const { MongoClient } = require("mongodb");
require("dotenv").config();

/**
 * Backup a database from source to target.
 *
 * @param {string} source_db_name Name of the source database
 * @param {string} target_db_name Name of the target database
 * @returns {Promise<[boolean, string]>} Tuple of [success, message]
 */
async function backup_database(source_db_name, target_db_name) {
  let client;
  try {
    const mongo_uri = process.env.MONGO_URI;
    if (!mongo_uri) {
      return [false, "MONGO_URI not found in environment variables"];
    }

    client = new MongoClient(mongo_uri);
    await client.connect();

    const source_db = client.db(source_db_name);
    const target_db = client.db(target_db_name);

    // Get list of all collections in the source database
    const collections = await source_db.listCollections().toArray();

    if (collections.length === 0) {
      await client.close();
      return [false, `No collections found in ${source_db_name}`];
    }

    // Drop the target database first to avoid duplicate key errors
    await target_db.dropDatabase();

    // Note: target_db reference is still valid even after dropping it

    for (const colInfo of collections) {
      const col_name = colInfo.name;
      // Skip system collections
      if (col_name.startsWith("system.")) {
        continue;
      }

      // Fetch all documents from the source collection
      const documents = await source_db.collection(col_name).find().toArray();

      if (documents.length > 0) {
        // Insert documents into the target collection
        await target_db.collection(col_name).insertMany(documents);
      } else {
        // If collection is empty, just create it
        await target_db.createCollection(col_name);
      }
    }

    await client.close();
    return [
      true,
      `Successfully backed up ${source_db_name} to ${target_db_name}`,
    ];
  } catch (e) {
    if (client) await client.close();
    return [false, `Error backing up database: ${e.message}`];
  }
}

module.exports = { backup_database };
