import { TestCase } from './test-case';
import { ITestResult } from './test-result.types';
import {
  Database,
  MutableDocument,
  Replicator,
  ReplicatorActivityLevel,
  ReplicatorConfiguration,
  ReplicatorStatus,
  ReplicatorType,
  URLEndpoint,
  URLEndpointListener,
  URLEndpointListenerStatus,
} from 'cblite-js';
import { expect } from 'chai';
export class URLEndpointListenerTests extends TestCase {
  constructor() {
    super();
  }

  async init(): Promise<ITestResult> {
    await super.init();
    const otherDatabaseResult = await this.getDatabase(this.otherDatabaseName, this.directory, '');
    if (otherDatabaseResult instanceof Database) {
      this.otherDatabase = otherDatabaseResult;
      console.log('otherDatabase: ', this.otherDatabase);
      this.otherDatabaseUniqueName = await this.otherDatabase.open();
    } else {
      return {
        testName: 'init',
        success: false,
        message: 'Failed to initialize other database',
        data: undefined,
      };
    }

    return {
      testName: 'init',
      success: true,
      message: 'Successfully initialized databases',
      data: undefined,
    };
  }

  /**
   * P2P Replication: Passive peer on db1, active peer on db2.
   * @returns {Promise<ITestResult>}
   */
  async testP2PReplication(): Promise<ITestResult> {
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    try {
      // 1. Create/open two databases
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();
      console.log('Collections:', collection1, collection2);

      // 2. Add documents to db1
      const doc1a = new MutableDocument('p2p_doc1a', { value: 'test1a' });

      await collection1.save(doc1a);
      console.log('Document p2p_doc1a saved in db1:', doc1a.toDictionary());

      // 3. Start Passive Peer (Listener) on db1
      listener = await URLEndpointListener.create({
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 4988,
        networkInterface: '0.0.0.0',
      });
      await listener.start();
      console.log(`Listener started on port ${listener.getPort()}`);

      // 4. Setup Active Peer (Replicator) on db2
      const endpointString = `wss://localhost:4988/${this.database.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setContinuous(false);

      replicator = await Replicator.create(config);
      console.log(`Replicator created for db2 with endpoint: ${endpointString}`);
      // Wait for replication to finish
      const token = await replicator.addChangeListener((change) => {
        const error = change.status.getError();
        if (error) {
          console.error(`Replication error: ${JSON.stringify(error)}`);
        } else {
          console.log(`Replication status: ${change.status.getActivityLevel()}`);
        }
      });

      await replicator.start(false);
      await this.sleep(1000);
      console.log(`Replicator started for db2`);

      // 5. Verify docs replicated to db2
      const doc1b = await collection2.document('p2p_doc1a');
      console.log('Document p2p_doc1a:', doc1b);
      expect(doc1b).to.not.be.null;
      expect(doc1b.getId()).to.equal(doc1a.getId());
      expect(doc1b.toDictionary()).to.deep.equal(doc1a.toDictionary());

      // Cleanup
      await replicator.removeChangeListener(token);
      console.log('Replication successful, stopping replicator and listener');

      await replicator.stop();
      await listener.stop();

      return {
        testName: 'testP2PReplication',
        success: true,
        message: 'Successfully replicated documents from passive to active peer',
        data: undefined,
      };
    } catch (error) {
      console.error(`Error in testP2PReplication: ${error}`);
      return {
        testName: 'testP2PReplication',
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
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 12345,
        networkInterface: '0.0.0.0',
        disableTLS: true,
        enableDeltaSync: true,
      };
      const listener = await URLEndpointListener.create(args);

      expect(listener.getCollections()).to.deep.equal(args.collections);
      expect(listener.getPort()).to.equal(args.port);
      expect(listener.getNetworkInterface()).to.equal(args.networkInterface);
      expect(listener.getDisableTLS()).to.equal(true);
      expect(listener.getEnableDeltaSync()).to.equal(true);

      await listener.stop();

      return {
        testName: 'testListenerGetters',
        success: true,
        message: 'All URLEndpointListener getters returned expected values',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testListenerGetters',
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
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 12346,
        networkInterface: '0.0.0.0',
        disableTLS: true,
        enableDeltaSync: false,
      };
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // Add 50 documents to db to make replication take longer
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`status_doc${i}`, { value: `test${i}` });
        await collection1.save(doc);
      }

      // Start listener
      const listener = await URLEndpointListener.create(args);
      await listener.start();

      // Setup and start replicator
      const endpointString = `ws://localhost:12346/${this.database.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
      config.setContinuous(true); // Set continuous to true

      const replicator = await Replicator.create(config);
      await replicator.start(false);

      await this.sleep(5000);
      // Check status after replication
      const statusAfterReplication = await listener.getStatus();
      expect(statusAfterReplication.activeConnectionCount).to.equal(0);
      expect(statusAfterReplication.connectionsCount).to.equal(1);

      // Cleanup
      await replicator.stop();
      await listener.stop();

      return {
        testName: 'testListenerGetStatus',
        success: true,
        message: 'Successfully tested URLEndpointListener getStatus',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testListenerGetStatus',
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
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    try {
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // Add 50 documents to db1
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`bulk_doc_${i}`, { value: `test${i}` });
        await collection1.save(doc);
      }

      // Start listener on db1
      listener = await URLEndpointListener.create({
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 4988,
        networkInterface: '0.0.0.0',
      });
      await listener.start();

      // Setup and start replicator on db2
      console.log(`Starting replicator to pull from ${this.database.getName()}...`);
      const endpointString = `wss://localhost:4988/${this.database.getName()}`;
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

      return {
        testName: 'testReplicateFiftyDocuments',
        success: allFound,
        message: allFound
          ? 'Successfully replicated all 50 documents'
          : 'Some documents were missing after replication',
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testReplicateFiftyDocuments',
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
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    try {
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // Add 50 documents to db2 (the active peer)
      for (let i = 0; i < 50; i++) {
        const doc = new MutableDocument(`push_doc_${i}`, { value: `test${i}` });
        await collection2.save(doc);
      }

      // Start listener on db1 (the passive peer)
      listener = await URLEndpointListener.create({
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 12348,
        networkInterface: '0.0.0.0',
      });
      await listener.start();

      // Setup and start replicator on db2 (active peer, pushing to db1)
      const endpointString = `wss://localhost:12348/${this.database.getName()}`;
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

      return {
        testName: 'testPushFiftyDocuments',
        success: allFound,
        message: allFound
          ? 'Successfully pushed all 50 documents to the passive peer'
          : 'Some documents were missing after push replication',
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testPushFiftyDocuments',
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
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    try {
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

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
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 12349,
        networkInterface: '0.0.0.0',
      });
      await listener.start();

      // Setup and start replicator on db2 (push and pull)
      const endpointString = `wss://localhost:12349/${this.database.getName()}`;
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

      return {
        testName: 'testPushAndPullFiftyDocuments',
        success: allFound,
        message: allFound
          ? 'Successfully replicated all 100 documents in both directions'
          : 'Some documents were missing after push and pull replication',
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testPushAndPullFiftyDocuments',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
  /**
   * Test P2P replication with basic authentication required on the listener.
   * The listener requires username/password, and the replicator must provide them.
   */
  async testP2PReplicationWithBasicAuth(): Promise<ITestResult> {
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    const USERNAME = 'testuser';
    const PASSWORD = 'testpass';
    try {
      // 1. Create/open two databases
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // 2. Add a document to db1
      const doc1a = new MutableDocument('p2p_auth_doc1a', { value: 'authTest1a' });
      await collection1.save(doc1a);

      // 3. Start Passive Peer (Listener) on db1 with basic auth required
      listener = await URLEndpointListener.create({
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 4990,
        networkInterface: '0.0.0.0',
        authenticatorConfig: {
          type: 'basic',
          data: {
            username: USERNAME,
            password: PASSWORD,
          },
        },
      });
      await listener.start();

      // 4. Setup Active Peer (Replicator) on db2 with correct basic auth
      const endpointString = `wss://localhost:4990/${this.database.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setContinuous(false);

      // Add BasicAuthenticator to replicator
      const { BasicAuthenticator } = await import('cblite-js');
      config.setAuthenticator(new BasicAuthenticator(USERNAME, PASSWORD));

      replicator = await Replicator.create(config);
      await replicator.start(false);
      await this.sleep(1000);

      // 5. Verify docs replicated to db2
      const doc1b = await collection2.document('p2p_auth_doc1a');
      expect(doc1b).to.not.be.null;
      expect(doc1b.getId()).to.equal(doc1a.getId());
      expect(doc1b.toDictionary()).to.deep.equal(doc1a.toDictionary());

      // Cleanup
      await replicator.stop();
      await listener.stop();

      return {
        testName: 'testP2PReplicationWithBasicAuth',
        success: true,
        message: 'Successfully replicated documents with basic auth required on listener',
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testP2PReplicationWithBasicAuth',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test P2P replication with incorrect basic authentication credentials.
   * The listener requires username/password, and the replicator provides wrong ones.
   * This should fail as expected.
   */
  async testP2PReplicationWithWrongBasicAuth(): Promise<ITestResult> {
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    const CORRECT_USERNAME = 'testuser';
    const CORRECT_PASSWORD = 'testpass';
    const WRONG_USERNAME = 'wronguser';
    const WRONG_PASSWORD = 'wrongpass';
    try {
      // 1. Create/open two databases
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // 2. Add a document to db1
      const doc1a = new MutableDocument('p2p_wrong_auth_doc1a', { value: 'wrongAuthTest1a' });
      await collection1.save(doc1a);

      // 3. Start Passive Peer (Listener) on db1 with basic auth required
      listener = await URLEndpointListener.create({
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 4991,
        networkInterface: '0.0.0.0',
        authenticatorConfig: {
          type: 'basic',
          data: {
            username: CORRECT_USERNAME,
            password: CORRECT_PASSWORD,
          },
        },
      });
      await listener.start();
      await this.sleep(1000);

      // 4. Setup Active Peer (Replicator) on db2 with incorrect basic auth
      const endpointString = `wss://localhost:4991/${this.database.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setContinuous(false);

      // Add BasicAuthenticator to replicator with wrong credentials
      const { BasicAuthenticator } = await import('cblite-js');
      config.setAuthenticator(new BasicAuthenticator(WRONG_USERNAME, WRONG_PASSWORD));

      replicator = await Replicator.create(config);

      // Create a promise that will resolve when we get an error
      const replicationError = new Promise((resolve) => {
        replicator.addChangeListener((change) => {
          const error = change.status.getError();
          if (error) {
            resolve(error);
          }
        });
      });

      await replicator.start(false);

      // Wait for error or timeout after 5 seconds
      const error = await Promise.race([
        replicationError,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for auth error')), 5000)
        ),
      ]);

      // Verify we got an authentication error
      expect(error).to.not.be.null;
      console.log('error: ', error);
      expect(error.toString()).to.include('Unauthorized');

      // Verify document was NOT replicated to db2
      const doc1b = await collection2.document('p2p_wrong_auth_doc1a');
      expect(doc1b).to.be.undefined;

      // Cleanup
      await replicator.stop();
      await listener.stop();

      return {
        testName: 'testP2PReplicationWithWrongBasicAuth',
        success: true,
        message: 'Successfully verified that replication fails with incorrect credentials',
        data: undefined,
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testP2PReplicationWithWrongBasicAuth',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  /**
   * Tests P2P replication with self-signed certificate where client rejects it
   * This should fail because the client is configured to not accept self-signed certs
   */
  async testP2PReplicationWithSelfSignedCertRejected(): Promise<ITestResult> {
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    try {
      // 1. Create/open two databases
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // 2. Add a test document to db1
      const doc1a = new MutableDocument('p2p_doc1a', { value: 'test1a' });
      await collection1.save(doc1a);

      // 3. Start Passive Peer (Listener) on db1 with self-signed cert
      listener = await URLEndpointListener.create({
        collections: [
          {
            databaseName: this.database.getUniqueName(),
            scopeName: '_default',
            name: '_default',
          },
        ],
        port: 4989,
        networkInterface: '0.0.0.0',
        tlsIdentityConfig: {
          mode: 'selfSigned',
          attributes: {
            certAttrCommonName: 'localhost',
          },
        },
      });
      await listener.start();

      // 4. Setup Active Peer (Replicator) on db2 that rejects self-signed certs
      const endpointString = `wss://localhost:4989/${this.database.getName()}`;
      const endpoint = new URLEndpoint(endpointString);
      const config = new ReplicatorConfiguration(endpoint);
      config.addCollection(collection2);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setContinuous(false);
      config.setAcceptOnlySelfSignedCerts(false); // Explicitly reject self-signed certs

      replicator = await Replicator.create(config);

      // Add change listener to capture the error
      let replicationError: string | null = null;
      const token = await replicator.addChangeListener((change) => {
        const error = change.status.getError();
        if (error) {
          replicationError = error;
        }
      });

      await replicator.start(false);
      await this.sleep(2000); // Wait for replication attempt

      // Verify that replication failed due to certificate error
      expect(replicationError).to.not.be.null;
      console.log('replicationError: ', replicationError);
      // Verify document was not replicated
      const doc1b = await collection2.document('p2p_doc1a');
      expect(doc1b).to.be.undefined;

      return {
        testName: 'testP2PReplicationWithSelfSignedCertRejected',
        success: true,
        data: undefined,
        message: 'Successfully verified that self-signed certificate was rejected',
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testP2PReplicationWithSelfSignedCertRejected',
        success: false,
        data: undefined,
        message: `Test failed with error: ${error}`,
      };
    }
  }

  /**
   * Tests P2P replication with self-signed certificate where client rejects it
   * This should fail because the client is configured to not accept self-signed certs
   */
  async testP2PReplicationWithBase64Cert(): Promise<ITestResult> {
    let listener: URLEndpointListener | undefined;
    let replicator: Replicator | undefined;
    try {
      // 1. Create/open two databases
      const collection1 = await this.database.defaultCollection();
      const collection2 = await this.otherDatabase.defaultCollection();

      // 2. Add a test document to db1
      const doc1a = new MutableDocument('p2p_doc1a', { value: 'test1a' });
      await collection1.save(doc1a);

      let error: string | null = null;
      // 3. Start Passive Peer (Listener) on db1 with self-signed cert
      try {
        listener = await URLEndpointListener.create({
          collections: [
            {
              databaseName: this.database.getUniqueName(),
              scopeName: '_default',
              name: '_default',
            },
          ],
          port: 4989,
          networkInterface: '0.0.0.0',
          tlsIdentityConfig: {
            mode: 'imported',
            password: '123',
            certBase64:
              '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',
          },
        });
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.null;
      if (listener) await listener.stop().catch(() => {});
      if (replicator) await replicator.stop().catch(() => {});

      return {
        testName: 'testP2pReplicationWithBase64Cert',
        success: true,
        data: undefined,
        message: 'Successfully verified that mocked cert was handled and rejected',
      };
    } catch (error) {
      if (replicator) await replicator.stop().catch(() => {});
      if (listener) await listener.stop().catch(() => {});
      return {
        testName: 'testP2pReplicationWithBase64Cert',
        success: false,
        data: undefined,
        message: `Test failed with error: ${error}`,
      };
    }
  }
  /**
   * Test TLS identity deletion functionality
   */
  async testTLSIdentityDeletion(): Promise<ITestResult> {
    let listener1: URLEndpointListener | undefined;
    let listener2: URLEndpointListener | undefined;
    const IDENTITY_LABEL = 'test-identity-deletion';

    try {
      const collection = await this.database.defaultCollection();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1); // Set expiration to tomorrow

      // 1. Create first listener with self-signed cert that expires tomorrow
      const createFirstListener = async () => {
        return await URLEndpointListener.create({
          collections: [
            {
              databaseName: this.database.getUniqueName(),
              scopeName: '_default',
              name: '_default',
            },
          ],
          port: 12350,
          networkInterface: '0.0.0.0',
          tlsIdentityConfig: {
            mode: 'selfSigned',
            label: IDENTITY_LABEL,
            expiration: tomorrow.toISOString(),
            attributes: {
              certAttrCommonName: 'test.identity.deletion',
            },
          },
        });
      };

      // 2. Create first listener (should succeed)
      listener1 = await createFirstListener();

      // 3. Try to create second listener with same label (should fail)
      let secondListenerError = null;
      try {
        listener2 = await createFirstListener(); // Same config, same label
        await listener2.start();
      } catch (error) {
        secondListenerError = error;
      }

      expect(secondListenerError).to.not.be.null;
      expect(secondListenerError.toString()).to.include('Certificate already exists');

      // 4. Delete the identity
      await URLEndpointListener.deleteIdentity({ label: IDENTITY_LABEL });
      await this.sleep(3000);

      // 5. Try to create listener again (should succeed now)
      listener2 = await createFirstListener();
      await listener2.start();

      // Cleanup
      await listener1.stop();
      await listener2.stop();
      await URLEndpointListener.deleteIdentity({ label: IDENTITY_LABEL });

      return {
        testName: 'testTLSIdentityDeletion',
        success: true,
        message: 'Successfully tested TLS identity deletion',
        data: undefined,
      };
    } catch (error) {
      if (listener1) await listener1.stop().catch(() => {});
      if (listener2) await listener2.stop().catch(() => {});
      return {
        testName: 'testTLSIdentityDeletion',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
}
