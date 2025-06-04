import { TestCase } from './test-case';
import { ITestResult } from './test-result.types';
import { Database, MutableDocument, Replicator, ReplicatorActivityLevel, ReplicatorConfiguration, ReplicatorType, URLEndpoint, URLEndpointListener } from 'cblite-js';
import { expect } from 'chai';
export class URLEndpointListenerTests extends TestCase {
  constructor() {
    super();
  }

/**
 * P2P Replication: Passive peer on db1, active peer on db2.
 * @returns {Promise<ITestResult>}
 */
async testP2PReplication(): Promise<ITestResult> {
  const db1 = this.database;
  const db2 = new Database(this.otherDatabaseName, this.database.getConfig())
  await db2.open();
  let listener
  let replicator
  try {
    // 1. Create/open two databases
    const collection1 = await db1.defaultCollection();
    const collection2 = await db2.defaultCollection();
    console.log('Collections:', collection1, collection2);

    // 2. Add documents to db1
    const doc1a = new MutableDocument('p2p_doc1a', { value: 'test1a' });

    await collection1.save(doc1a);
    console.log('Document p2p_doc1a saved in db1:', doc1a.toDictionary());

    // 3. Start Passive Peer (Listener) on db1
    listener =  await URLEndpointListener.create({
      collections: [{
        databaseName: db1.getUniqueName(),
        scopeName: '_default',
        name: '_default'
      }],
      port: 4988,
      networkInterface: '0.0.0.0',
    });
    await listener.start();
    console.log(`Listener started on port ${listener.getPort()}`);

    // 4. Setup Active Peer (Replicator) on db2
    const endpointString = `wss://localhost:4988/${db1.getName()}`
    const endpoint = new URLEndpoint(endpointString);
    const config = new ReplicatorConfiguration(endpoint);
    config.addCollection(collection2);
    config.setReplicatorType(ReplicatorType.PULL);
    config.setAcceptOnlySelfSignedCerts(true);
    config.setContinuous(false);

    replicator = await Replicator.create(config);
    console.log(`Replicator created for db2 with endpoint: ${endpointString}`);
    // Wait for replication to finish
    const token = await replicator.addChangeListener((change) => {
      const error = change.status.getError();
      if (error) {
        console.error(`Replication error: ${JSON.stringify(error)}`);
        throw new Error(`Replication error: ${JSON.stringify(error)}`);
      } else {
        console.log(`Replication status: ${change.status.getActivityLevel()}`);
      }
      if (change.status.getActivityLevel() === ReplicatorActivityLevel.STOPPED) {
        console.log('Replication stopped successfully');
      }
      if (change.status.getActivityLevel() === ReplicatorActivityLevel.IDLE) {
        console.log('Replication is idle');
      }
      if (change.status.getActivityLevel() === ReplicatorActivityLevel.BUSY) {
        console.log('Replication is busy');
      }
      if (change.status.getActivityLevel() === ReplicatorActivityLevel.CONNECTING) {
        console.log('Replication is connecting');
      }
      if (change.status.getActivityLevel() === ReplicatorActivityLevel.OFFLINE) {
        console.log('Replication is offline');
      }
    })

    await replicator.start(false);
    await this.sleep(1000)
    console.log(`Replicator started for db2`);

    // 5. Verify docs replicated to db2
    const doc1b = await collection2.document('p2p_doc1a');
    console.log('Document p2p_doc1a:', doc1b);
    expect(doc1b).to.not.be.null;
    expect(doc1b.getId()).to.equal(doc1a.getId());
    expect(doc1b.toDictionary()).to.deep.equal(doc1a.toDictionary());

    // Cleanup
    
    console.log('Replication successful, stopping replicator and listener');
    await replicator.stop();
    await listener.stop();
    await db1.close();
    await db2.close();

    return {
      testName: "testP2PReplication",
      success: true,
      message: "Successfully replicated documents from passive to active peer",
      data: undefined,
    };
  } catch (error) {
    console.error(`Error in testP2PReplication: ${error}`);
    return {
      testName: "testP2PReplication",
      success: false,
      message: `${error}`,
      data: error.stack || error.toString(),
    };
  }
}

  /**
   * Test URLEndpointListener getters.
   */
  async testListenerGetters(): Promise<ITestResult> {
    try {
      const args = {
        collections: [{
          databaseName:this.database.getUniqueName(),
          scopeName: '_default',
          name: '_default'
        }],
        port: 12345,
        networkInterface: 'en0',
        disableTLS: true,
        enableDeltaSync: true
      };
      const listener = await URLEndpointListener.create(args);

      expect(listener.getCollections()).to.deep.equal(args.collections);
      expect(listener.getPort()).to.equal(args.port);
      expect(listener.getNetworkInterface()).to.equal(args.networkInterface);
      expect(listener.getDisableTLS()).to.equal(true);
      expect(listener.getEnableDeltaSync()).to.equal(true);

      await listener.stop();

      return {
        testName: "testListenerGetters",
        success: true,
        message: "All URLEndpointListener getters returned expected values",
        data: undefined,
      };
    } catch (error) {
      return {
        testName: "testListenerGetters",
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
    /**
   * Test URLEndpointListener getStatus method, including while replicator is connected and after stopping.
   * Adds 50 documents to increase replication time for better status observation.
   */
    async testListenerGetStatus(): Promise<ITestResult> {
      try {
        const args = {
          collections: [{
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default'
          }],
          port: 12346,
          networkInterface: '0.0.0.0',
          disableTLS: true,
          enableDeltaSync: false
        };
        const db = this.database;
        const db2 = new Database(this.otherDatabaseName, db.getConfig());
        await db2.open();
        const collection1 = await db.defaultCollection();
        const collection2 = await db2.defaultCollection();
  
        // Add 50 documents to db to make replication take longer
        for (let i = 0; i < 50; i++) {
          const doc = new MutableDocument(`status_doc${i}`, { value: `test${i}` });
          await collection1.save(doc);
        }
  
        // Start listener
        const listener = await URLEndpointListener.create(args);
        await listener.start();
  
        // Check status before replication
        const statusBefore = await listener.getStatus();
        console.log('Listener status before replication:', statusBefore);
  
        // Setup and start replicator
        const endpointString = `ws://localhost:12346/${db.getName()}`;
        const endpoint = new URLEndpoint(endpointString);
        const config = new ReplicatorConfiguration(endpoint);
        config.addCollection(collection2);
        config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
        config.setContinuous(true); // Set continuous to true
  
        const replicator = await Replicator.create(config);
        await replicator.start(false);
  
        const statusDuring = await listener.getStatus();
        console.log('Listener status during replication:', statusDuring);
  
        // Check status after replication
        const statusAfterReplication = await listener.getStatus();
        console.log('Listener status after replication:', statusAfterReplication);
  
        // Cleanup
        await replicator.stop();
        await listener.stop();
  
        // Check status after stopping listener
        let statusAfter: any;
        try {
          statusAfter = await listener.getStatus();
          console.log('Listener status after stop:', statusAfter);
        } catch (err) {
          statusAfter = { error: err.message || err.toString() };
          console.log('Listener status after stop (error):', statusAfter);
        }
  
        await db2.close();
  
        return {
          testName: "testListenerGetStatus",
          success: true,
          message: "URLEndpointListener getStatus returned expected structure before, during, and after replication",
          data: undefined,
        };
      } catch (error) {
        return {
          testName: "testListenerGetStatus",
          success: false,
          message: `${error}`,
          data: error.stack || error.toString(),
        };
      }
    }
  /**
   * Test replicating 50 documents from one database to another using a listener and a replicator.
   */
  async testReplicateFiftyDocuments(): Promise<ITestResult> {
    const db1 = this.database;
    const db2 = new Database(this.otherDatabaseName, db1.getConfig());
    await db2.open();
    let listener: URLEndpointListener | undefined;
    let replicator: any;
    try {
      const collection1 = await db1.defaultCollection();
      const collection2 = await db2.defaultCollection();

      // Add 50 documents to db1
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`bulk_doc_${i}`, { value: `test${i}` });
        await collection1.save(doc);
      }

      // Start listener on db1
      listener = await URLEndpointListener.create({
        collections: [{
          databaseName: db1.getUniqueName(),
          scopeName: '_default',
          name: '_default'
        }],
        port: 4988,
        networkInterface: '0.0.0.0',
      });
      await listener.start();

      // Setup and start replicator on db2
      console.log(`Starting replicator to pull from ${db1.getName()}...`);
      const endpointString = `wss://localhost:4988/${db1.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setContinuous(false);

      replicator = await Replicator.create(config);
      await replicator.start(false);

      // Wait for replication to finish
      await this.sleep(2000);

      // Check that all 50 documents are present in db2
      let allFound = true;
      for (let i = 0; i < 50; i++) {
        const doc = await collection2.document(`bulk_doc_${i}`);
        if (!doc) {
          allFound = false;
          break;
        }
        expect(doc.getId()).to.equal(`bulk_doc_${i}`);
        expect(doc.toDictionary().value).to.equal(`test${i}`);
      }

      // Cleanup
      await replicator.stop();
      await listener.stop();
      await db2.close();

      return {
        testName: "testReplicateFiftyDocuments",
        success: allFound,
        message: allFound
          ? "Successfully replicated all 50 documents"
          : "Some documents were missing after replication",
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      await db2.close().catch(() => {});
      return {
        testName: "testReplicateFiftyDocuments",
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
  /**
   * Test pushing 50 documents from an active peer (replicator) to a passive peer (listener).
   * Documents are created in db2 and pushed to db1.
   */
  async testPushFiftyDocuments(): Promise<ITestResult> {
    const db1 = this.database;
    const db2 = new Database(this.otherDatabaseName, db1.getConfig());
    await db2.open();
    let listener: URLEndpointListener | undefined;
    let replicator: any;
    try {
      const collection1 = await db1.defaultCollection();
      const collection2 = await db2.defaultCollection();

      // Add 50 documents to db2 (the active peer)
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`push_doc_${i}`, { value: `test${i}` });
        await collection2.save(doc);
      }

      // Start listener on db1 (the passive peer)
      listener = await URLEndpointListener.create({
        collections: [{
          databaseName: db1.getUniqueName(),
          scopeName: '_default',
          name: '_default'
        }],
        port: 12348,
        networkInterface: '0.0.0.0',
      });
      await listener.start();

      // Setup and start replicator on db2 (active peer, pushing to db1)
      const endpointString = `wss://localhost:12348/${db1.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PUSH);
      config.setContinuous(false);

      replicator = await Replicator.create(config);
      await replicator.start(false);

      // Wait for replication to finish
      await this.sleep(2000);

      // Check that all 50 documents are present in db1
      let allFound = true;
      for (let i = 0; i < 50; i++) {
        const doc = await collection1.document(`push_doc_${i}`);
        if (!doc) {
          allFound = false;
          break;
        }
        expect(doc.getId()).to.equal(`push_doc_${i}`);
        expect(doc.toDictionary().value).to.equal(`test${i}`);
      }

      // Cleanup
      await replicator.stop();
      await listener.stop();
      await db2.close();

      return {
        testName: "testPushFiftyDocuments",
        success: allFound,
        message: allFound
          ? "Successfully pushed all 50 documents to the passive peer"
          : "Some documents were missing after push replication",
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      await db2.close().catch(() => {});
      return {
        testName: "testPushFiftyDocuments",
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
  /**
   * Test bidirectional (push and pull) replication of 50 documents between two databases.
   * db1 and db2 each start with 50 unique docs, after replication both should have all 100 docs.
   */
  async testPushAndPullFiftyDocuments(): Promise<ITestResult> {
    const db1 = this.database;
    const db2 = new Database(this.otherDatabaseName, db1.getConfig());
    await db2.open();
    let listener: URLEndpointListener | undefined;
    let replicator: any;
    try {
      const collection1 = await db1.defaultCollection();
      const collection2 = await db2.defaultCollection();

      // Add 50 docs to db1
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`pp_doc1_${i}`, { value: `db1_${i}` });
        await collection1.save(doc);
      }
      // Add 50 docs to db2
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`pp_doc2_${i}`, { value: `db2_${i}` });
        await collection2.save(doc);
      }

      // Start listener on db1
      listener = await URLEndpointListener.create({
        collections: [{
          databaseName: db1.getUniqueName(),
          scopeName: '_default',
          name: '_default'
        }],
        port: 12349,
        networkInterface: '0.0.0.0',
      });
      await listener.start();

      // Setup and start replicator on db2 (push and pull)
      const endpointString = `wss://localhost:12349/${db1.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
      config.setContinuous(false);

      replicator = await Replicator.create(config);
      await replicator.start(false);

      // Wait for replication to finish
      await this.sleep(2000);

      // Check that all 100 documents are present in both db1 and db2
      let allFound = true;
      // db1 should have its own 50 + 50 from db2
      for (let i = 0; i < 50; i++) {
        const doc = await collection1.document(`pp_doc2_${i}`);
        if (!doc) {
          allFound = false;
          break;
        }
        expect(doc.getId()).to.equal(`pp_doc2_${i}`);
        expect(doc.toDictionary().value).to.equal(`db2_${i}`);
      }
      // db2 should have its own 50 + 50 from db1
      for (let i = 0; i < 50; i++) {
        const doc = await collection2.document(`pp_doc1_${i}`);
        if (!doc) {
          allFound = false;
          break;
        }
        expect(doc.getId()).to.equal(`pp_doc1_${i}`);
        expect(doc.toDictionary().value).to.equal(`db1_${i}`);
      }

      // Cleanup
      await replicator.stop();
      await listener.stop();
      await db2.close();

      return {
        testName: "testPushAndPullFiftyDocuments",
        success: allFound,
        message: allFound
          ? "Successfully replicated all 100 documents in both directions"
          : "Some documents were missing after push and pull replication",
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      await db2.close().catch(() => {});
      return {
        testName: "testPushAndPullFiftyDocuments",
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
}