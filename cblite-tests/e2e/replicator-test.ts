import { TestCase } from './test-case';
import { ITestResult } from './test-result.types';
import {
  BasicAuthenticator,
  Replicator,
  ReplicatorActivityLevel,
  ReplicatorConfiguration,
  ReplicatorType,
  URLEndpoint,
  CollectionConfig,
  Collection,
  DatabaseConfiguration,
  Database,
  MutableDocument,
} from 'cblite-js';
import { expect } from 'chai';

/**
 * ReplicatorTests - needs running Sync Gate to pass, visit README.md for more information.
 * Reminder all test cases must start with 'test' in the name of the method or they will not run
 * */
export class ReplicatorTests extends TestCase {
  constructor() {
    super();
  }

  platformDomains = {
    ios: 'localhost',
    android: '10.0.2.2',
  };

  private readonly SYNC_GATEWAY_URL = `ws://${this.platformDomains?.[this.platform] ?? 'WRONG PLATFORM'}:4984/projects`;
  private readonly SYNC_GATEWAY_WRONG_URL = `ws://${this.platformDomains?.[this.platform] ?? 'WRONG PLATFORM'}:4984/unknown-db`;
  private readonly TEST_USERNAME = 'demo@example.com';
  private readonly TEST_PASSWORD = 'P@ssw0rd12';

  private createConfig(
    type: ReplicatorType = ReplicatorType.PUSH_AND_PULL,
    continuous: boolean = false,
    collection: Collection = this.defaultCollection,
    collectionConfig?: CollectionConfig
  ): ReplicatorConfiguration {
    const target = new URLEndpoint(this.SYNC_GATEWAY_URL);
    const config = new ReplicatorConfiguration(target);
    config.setReplicatorType(type);
    config.setContinuous(continuous);
    config.addCollection(collection, collectionConfig);

    // Add default authenticator
    const auth = new BasicAuthenticator(this.TEST_USERNAME, this.TEST_PASSWORD);
    config.setAuthenticator(auth);

    return config;
  }

  private async runReplication(
    config: ReplicatorConfiguration,
    reset: boolean = false
  ): Promise<void> {
    const replicator = await Replicator.create(config);

    let listenerToken: string;
    const completionPromise = new Promise<void>((resolve, reject) => {
      replicator
        .addChangeListener((change) => {
          const status = change.status;
          const activityLevel = status.getActivityLevel();
          console.log(JSON.stringify(change.status.getProgress(), null, 2));
          if (
            config.getContinuous() &&
            activityLevel == ReplicatorActivityLevel.IDLE
          ) {
            this.sleep(500);
            if (
              status.getProgress().getCompleted() ==
              status.getProgress().getTotal()
            )
              console.log('STOPING');
            replicator.stop();
          }

          if (activityLevel === ReplicatorActivityLevel.STOPPED) {
            const error = status.getError();
            if (error) {
              reject(new Error(`Replication ${JSON.stringify(error)}`));
            } else {
              resolve();
            }
          }
        })
        .then((token) => {
          listenerToken = token;
        });
    });

    try {
      await replicator.start(reset);
      await completionPromise;
    } catch (e) {
      console.error(e);
    } finally {
      await replicator.removeChangeListener(listenerToken);
      replicator.stop();
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testReplicatorConfigDefaultValues(): Promise<ITestResult> {
    const target = new URLEndpoint(this.SYNC_GATEWAY_URL);
    const config = new ReplicatorConfiguration(target);
    config.addCollection(this.collection);

    try {
      //check to make sure that the default values are being set in the configuration
      expect(config.getCollections().length).to.be.equal(1);
      expect(config.getCollections()[0]).to.be.equal(this.collection);
      expect(config.getReplicatorType()).to.be.equal(
        ReplicatorType.PUSH_AND_PULL
      );

      expect(config.getAcceptOnlySelfSignedCerts()).to.be.equal(
        ReplicatorConfiguration.defaultSelfSignedCertificateOnly
      );
      expect(config.getAllowReplicatingInBackground()).to.be.equal(
        ReplicatorConfiguration.defaultAllowReplicatingInBackground
      );
      expect(config.getAcceptParentDomainCookies()).to.be.equal(
        ReplicatorConfiguration.defaultAcceptParentDomainCookies
      );
      expect(config.getAutoPurgeEnabled()).to.be.equal(
        ReplicatorConfiguration.defaultEnableAutoPurge
      );
      expect(config.getContinuous()).to.be.equal(
        ReplicatorConfiguration.defaultContinuous
      );
      expect(config.getHeartbeat()).to.be.equal(
        ReplicatorConfiguration.defaultHeartbeat
      );
      expect(config.getMaxAttempts()).to.be.equal(
        ReplicatorConfiguration.defaultMaxAttemptsSingleShot
      );
      expect(config.getMaxAttemptWaitTime()).to.be.equal(
        ReplicatorConfiguration.defaultMaxAttemptsWaitTime
      );

      expect(config.getHeaders()).to.be.equal(undefined);
      expect(config.getAuthenticator()).to.be.equal(undefined);
      return {
        testName: 'testReplicatorConfigDefaultValues',
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testReplicatorConfigDefaultValues',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testReplicationStatusChangeListenerEvent(): Promise<ITestResult> {
    try {
      const config = this.createConfig();
      let isError = false;
      let didGetChangeStatus = false;

      const replicator = await Replicator.create(config);
      const token = await replicator.addChangeListener((change) => {
        // Check to see if there was an error
        const error = change.status.getError();
        if (error !== undefined) {
          isError = true;
        }
        didGetChangeStatus = true;
      });

      // Don't start with a new checkpoint
      await replicator.start(false);

      // Short wait to allow replication to make progress
      await this.sleep(500);

      // Clean up
      await replicator.removeChangeListener(token);
      await replicator.stop();

      // Validate we got documents replicated
      const count = await this.defaultCollection.count();
      expect(count.count).to.be.greaterThan(0);

      // Validate our listener was called and there weren't errors
      expect(isError).to.be.false;
      expect(didGetChangeStatus).to.be.true;

      return {
        testName: 'testReplicationStatusChangeListenerEvent',
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testReplicationStatusChangeListenerEvent',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testDocumentChangeListenerEvent(): Promise<ITestResult> {
    try {
      const config = this.createConfig();
      let isError = false;
      let didGetDocumentUpdate = false;

      const replicator = await Replicator.create(config);
      const token = await replicator.addDocumentChangeListener((change) => {
        // Check to see if the documents were pushed or pulled
        for (const doc of change.documents) {
          if (doc.error !== undefined) {
            isError = true;
          }
        }
        didGetDocumentUpdate = true;
      });

      // Start the replicator
      await replicator.start(false);

      // Short wait to allow replication to make progress
      await this.sleep(500);

      // Clean up
      await replicator.removeChangeListener(token);
      await replicator.stop();

      // Validate we got documents replicated
      const count = await this.defaultCollection.count();
      expect(count.count).to.be.greaterThan(0);

      // Validate our listener was called and there weren't errors
      expect(isError).to.be.false;
      expect(didGetDocumentUpdate).to.be.true;

      return {
        testName: 'testDocumentChangeListenerEvent',
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testDocumentChangeListenerEvent',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testEmptyPush(): Promise<ITestResult> {
    try {
      let isError = false;
      let listenerToken;
      const config = this.createConfig(ReplicatorType.PUSH, false);

      const replicator = await Replicator.create(config);

      const replicatorCompletionPromise = new Promise<void>(
        (resolve, reject) => {
          replicator
            .addChangeListener((change) => {
              const status = change.status;
              const activityLevel = status.getActivityLevel();

              if (activityLevel === ReplicatorActivityLevel.STOPPED) {
                const error = status.getError();
                if (error) {
                  isError = true;
                  reject();
                } else {
                  resolve();
                }
              }
            })
            .then((token) => {
              listenerToken = token;
            });
        }
      );

      await replicator.start(false);
      await replicatorCompletionPromise;
      await replicator.removeChangeListener(listenerToken);
      await replicator.stop();

      // Validate our listener was called and there weren't errors
      expect(isError).to.be.false;

      return {
        testName: 'testEmptyPush',
        success: true,
        message: 'Successfully completed empty push replication',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testEmptyPush',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }
  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStartWithCheckpoint(): Promise<ITestResult> {
    try {
      // Create a test document with a unique ID to avoid conflicts
      const testDocId = `test-doc-${Date.now()}`;
      const doc = this.createDocument(testDocId);
      doc.setString('species', 'Tiger');
      doc.setString('documentType', 'project'); // Required by sync function
      doc.setString('team', 'team1');
      await this.defaultCollection.save(doc);

      // Push the document to Sync Gateway
      const pushConfig = this.createConfig(ReplicatorType.PUSH, false);
      await this.runReplication(pushConfig);

      // Pull to establish checkpoint
      const pullConfig = this.createConfig(ReplicatorType.PULL, false);
      await this.runReplication(pullConfig);

      // Purge the document from the local database
      const docToDelete = await this.defaultCollection.document(testDocId);
      if (docToDelete) {
        await this.defaultCollection.purge(docToDelete);
      }

      // Verify the document was purged
      const checkDoc = await this.defaultCollection.document(testDocId);
      expect(checkDoc).to.be.undefined;

      // Pull without reset (should not pull the document due to checkpoint)
      await this.runReplication(pullConfig);

      // Verify document still doesn't exist (checkpoint prevented pulling it)
      const afterNormalPull = await this.defaultCollection.document(testDocId);
      expect(afterNormalPull).to.be.undefined;

      // Pull with reset checkpoint
      await this.runReplication(pullConfig, true);

      // Verify document was pulled after reset
      const afterResetPull = await this.defaultCollection.document(testDocId);
      expect(afterResetPull).to.not.be.undefined;
      expect(afterResetPull.getId()).to.equal(testDocId);

      return {
        testName: 'testStartWithCheckpoint',
        success: true,
        message: 'Successfully verified checkpoint reset behavior',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testStartWithCheckpoint',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStartWithResetCheckpointContinuous(): Promise<ITestResult> {
    try {
      // Create a test document with a unique ID to avoid conflicts
      const testDocId = `test-doc-continuous-${Date.now()}`;
      const doc = this.createDocument(testDocId);
      doc.setString('species', 'Tiger');
      doc.setString('documentType', 'project'); // Required by sync function
      doc.setString('team', 'team1');
      await this.defaultCollection.save(doc);

      // Push the document to Sync Gateway
      const pushConfig = this.createConfig(ReplicatorType.PUSH, true);
      await this.runReplication(pushConfig);

      // Pull to establish checkpoint
      const pullConfig = this.createConfig(ReplicatorType.PULL, true);
      await this.runReplication(pullConfig);

      // Purge the document from the local database
      const docToDelete = await this.defaultCollection.document(testDocId);
      if (docToDelete) {
        await this.defaultCollection.purge(docToDelete);
      }

      // Verify the document was purged
      const checkDoc = await this.defaultCollection.document(testDocId);
      expect(checkDoc).to.be.undefined;

      // Pull without reset (should not pull the document due to checkpoint)
      await this.runReplication(pullConfig);

      // Verify document still doesn't exist (checkpoint prevented pulling it)
      const afterNormalPull = await this.defaultCollection.document(testDocId);
      expect(afterNormalPull).to.be.undefined;

      // Pull with reset checkpoint
      await this.runReplication(pullConfig, true);

      // Verify document was pulled after reset
      const afterResetPull = await this.defaultCollection.document(testDocId);
      expect(afterResetPull).to.not.be.undefined;
      expect(afterResetPull.getId()).to.equal(testDocId);

      return {
        testName: 'testStartWithResetCheckpointContinuous',
        success: true,
        message:
          'Successfully verified checkpoint reset behavior with continuous replication',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testStartWithResetCheckpointContinuous',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testRemoveDocumentReplicationListener(): Promise<ITestResult> {
    try {
      const config = this.createConfig();
      let isError = false;
      let didGetDocumentUpdate = false;

      const replicator = await Replicator.create(config);
      const token = await replicator.addDocumentChangeListener((change) => {
        // Check to see if the documents were pushed or pulled
        for (const doc of change.documents) {
          if (doc.error !== undefined) {
            isError = true;
          }
        }
        didGetDocumentUpdate = true;
      });

      // Start the replicator
      await replicator.start(false);
      await this.sleep(500);

      // Clean up
      await replicator.removeChangeListener(token);
      await replicator.stop();

      // Validate we got documents replicated
      const count = await this.defaultCollection.count();
      expect(count.count).to.be.greaterThan(0);

      // try to remove already removed listener
      let error;
      try {
        await replicator.removeChangeListener(token);
      } catch (err) {
        error = err;
      }

      expect(error.message).to.contain('No such listener found');

      return {
        testName: 'testRemoveDocumentReplicationListener',
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testRemoveDocumentReplicationListener',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }

  // /**
  //  *
  //  * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
  //  */
  // async testDocumentReplicationEventWithPushConflict(): Promise<ITestResult> {
  //   return {
  //     testName: "testDocumentReplicationEventWithPushConflict",
  //     success: false,
  //     message: "Not implemented",
  //     data: undefined,
  //   };
  // }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testDocumentReplicationEventWithPullConflict(): Promise<ITestResult> {
    try {
      const docId = `doc-conflict-pull-${Date.now()}`;
      const localDoc = this.createDocument(docId);
      localDoc.setString('species', 'Tiger');
      localDoc.setString('pattern', 'Star');
      localDoc.setString('documentType', 'project'); // Required by sync function
      localDoc.setString('team', 'team1');
      await this.defaultCollection.save(localDoc);

      const target = new URLEndpoint(this.SYNC_GATEWAY_URL);
      const auth = new BasicAuthenticator('demo@example.com', 'P@ssw0rd12');

      // Push the document to Sync Gateway
      let config = new ReplicatorConfiguration(target);
      config.addCollection(this.defaultCollection);
      config.setReplicatorType(ReplicatorType.PUSH);
      config.setAuthenticator(auth);

      await this.runReplication(config);

      // Create a separate database to modify the document on Sync Gateway
      const dbConfig = new DatabaseConfiguration();
      dbConfig.setDirectory(this.directory);
      const otherDb = new Database(this.otherDatabaseName, dbConfig);
      await otherDb.open();

      if (!(otherDb instanceof Database)) {
        return {
          testName: 'testEqualityDifferentDB',
          success: false,
          message: "otherDb isn't a database instance",
          data: undefined,
        };
      }
      const otherCollection = await otherDb.defaultCollection();

      // Pull the document to the other database
      config = new ReplicatorConfiguration(target);
      config.addCollection(otherCollection);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setAuthenticator(auth);

      await this.runReplication(config);

      // Modify the document in the other database
      const otherDoc = await otherCollection.document(docId);
      const mutableOtherDoc = MutableDocument.fromDocument(otherDoc);
      mutableOtherDoc.setString('pattern', 'Striped'); // Different from "Star"
      await otherCollection.save(mutableOtherDoc);

      // Push the modified document back to Sync Gateway
      config = new ReplicatorConfiguration(target);
      config.addCollection(otherCollection);
      config.setReplicatorType(ReplicatorType.PUSH);
      config.setAuthenticator(auth);

      await this.runReplication(config);

      // Now we have a conflict: local document is "Star", Sync Gateway has "Striped"

      // Try to pull, which should merge with local version
      config = new ReplicatorConfiguration(target);
      config.addCollection(this.defaultCollection);
      config.setReplicatorType(ReplicatorType.PULL);
      config.setAuthenticator(auth);

      const replicator = await Replicator.create(config);

      // Track the replication events
      let conflictDoc: any = null;

      const docChangePromise = new Promise<void>((resolve) => {
        replicator.addDocumentChangeListener((change) => {
          if (!change.isPush) {
            for (const doc of change.documents) {
              if (doc.id === docId) {
                conflictDoc = doc;
                resolve();
              }
            }
          }
        });
      });

      // Start replication and wait for the document change event
      await replicator.start(false);

      // Wait for the document change event or timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(
          () => reject(new Error('Timeout waiting for document change event')),
          5000
        );
      });

      try {
        await Promise.race([docChangePromise, timeoutPromise]);
      } catch (e) {
        // If we timeout, stop replication and throw
        await replicator.stop();
        throw e;
      }

      // Stop replication
      await replicator.stop();

      // Verify the document replication event
      expect(conflictDoc).to.not.be.null;
      expect(conflictDoc.id).to.equal(docId);
      expect(conflictDoc.error).to.be.undefined; // Pull conflict doesn't report an error

      // Check that the document was updated with the remote version
      const updatedDoc = await this.defaultCollection.document(docId);
      expect(updatedDoc.getString('pattern')).to.equal('Striped');

      return {
        testName: 'testDocumentReplicationEventWithPullConflict',
        success: true,
        message:
          'Successfully verified document replication event with pull conflict',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testDocumentReplicationEventWithPullConflict',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    } finally {
      // Clean up the other database
      if (this.otherDatabase) {
        await this.otherDatabase.close();
        await this.deleteDatabase(this.otherDatabase);
        this.otherDatabase = undefined;
      }
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testDocumentReplicationEventWithDeletion(): Promise<ITestResult> {
    try {
      const doc1Id = `docForDelete-${Date.now()}`;
      const doc1 = this.createDocumentWithIdAndData(doc1Id, {
        name: 'docForDelete',
        team: 'team1',
      });
      doc1.setString('documentType', 'project');

      this.defaultCollection.save(doc1);

      this.defaultCollection.deleteDocument(doc1);

      const replConfig = this.createConfig(
        ReplicatorType.PUSH,
        false,
        this.defaultCollection
      );
      const replicator = await Replicator.create(replConfig);
      const replicatedDocuments = [];

      const token = await replicator.addDocumentChangeListener((change) => {
        change.documents.forEach((document) =>
          replicatedDocuments.push(document)
        );
      });

      await replicator.start(false);

      await this.sleep(500);

      await replicator.removeChangeListener(token);

      expect(replicatedDocuments[0].id).to.be.equal(doc1Id);
      expect(replicatedDocuments[0].flags).contains('DELETED');

      return {
        testName: 'testDocumentReplicationEventWithDeletion',
        success: true,
        message: 'success',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testDocumentReplicationEventWithDeletion',
        success: false,
        message: `${error}`,
        data: undefined,
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testContinuousPushFilter(): Promise<ITestResult> {
    const docCount = 100;
    try {
      const docs = await this.createDocs(docCount);

      const collConfig = new CollectionConfig(undefined, undefined);
      collConfig.setPushFilter((doc, flags) => {
        'replicatorFilter';
        return Boolean(doc['number'] % 3);
      });

      const pushConfig = this.createConfig(
        ReplicatorType.PUSH_AND_PULL,
        true,
        this.defaultCollection,
        collConfig
      );

      const replicator = await Replicator.create(pushConfig);
      let listenerToken: string;

      await new Promise<void>((resolve) => {
        replicator
          .addChangeListener((change) => {
            const status = change.status;
            if (status.getActivityLevel() === ReplicatorActivityLevel.IDLE) {
              resolve();
            }
          })
          .then((token) => {
            listenerToken = token;
          });

        replicator.start(false);
      });

      const nextDocs = this.createDocumentNumbered(docCount + 1, docCount * 2);
      for (const doc of nextDocs) {
        await this.defaultCollection.save(doc);
      }
      await this.sleep(500);

      await replicator.stop();
      await replicator.removeChangeListener(listenerToken);

      [...docs, ...nextDocs].forEach(
        async (doc) => await this.defaultCollection.purgeById(doc.getId())
      );

      const pullConfig = this.createConfig(
        ReplicatorType.PULL,
        false,
        this.defaultCollection
      );

      await this.runReplication(pullConfig);

      const filterQuery = this.database.createQuery(`
            SELECT COUNT(*) as count
            FROM _default._default
            WHERE number % 3 = 1 AND number > ${docCount}
        `);

      const [{ count }] = await filterQuery.execute();

      expect(count).to.be.above(0);

      return {
        testName: 'testContinuousPushFilter',
        success: true,
        message: `success`,
        data: null,
      };
    } catch (error) {
      return {
        testName: 'testContinuousPushFilter',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  // /**
  //  *
  //  * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
  //  */
  // async testPullFilter(): Promise<ITestResult> {
  //   return {
  //     testName: "testPullFilter",
  //     success: false,
  //     message: "Not implemented",
  //     data: undefined,
  //   };
  // }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testPushAndForget(): Promise<ITestResult> {
    try {
      const docId = `forget-${Date.now()}`;

      const docToRemove = new MutableDocument(docId);
      docToRemove.setString('species', 'Tiger');
      docToRemove.setString('pattern', 'Hobbes');
      await this.defaultCollection.save(docToRemove);

      let documentDeletedResolve: () => void;
      const documentDeletedPromise = new Promise<void>((resolve) => {
        documentDeletedResolve = resolve;
      });

      const changeListenerToken =
        await this.defaultCollection.addDocumentChangeListener(
          docToRemove.getId(),
          async (change) => {
            if (change.documentId === docToRemove.getId()) {
              const retrievedDoc = await this.defaultCollection.document(
                docToRemove.getId()
              );
              if (retrievedDoc === undefined) {
                documentDeletedResolve();
              }
            }
          }
        );

      const initialSourceCount = await this.defaultCollection.count();
      expect(initialSourceCount.count).to.equal(1);

      const pushConfig = this.createConfig(ReplicatorType.PUSH, false);
      const replicator = await Replicator.create(pushConfig);

      const docReplicationToken = await replicator.addDocumentChangeListener(
        async (change) => {
          const ourDocument = change.documents.find(
            (doc) => doc.id === docToRemove.getId()
          );
          if (ourDocument && change.isPush) {
            // Set expiration to current date (immediate expiry)
            await this.defaultCollection.setDocumentExpiration(
              docToRemove.getId(),
              new Date()
            );
          }
        }
      );

      await replicator.start(false);

      await documentDeletedPromise;

      await replicator.stop();
      await replicator.removeChangeListener(docReplicationToken);
      await this.defaultCollection.removeDocumentChangeListener(
        changeListenerToken
      );

      const finalSourceCount = await this.defaultCollection.count();

      expect(finalSourceCount.count).to.equal(0);

      return {
        testName: 'testPushAndForget',
        success: true,
        message: `success`,
        data: null,
      };
    } catch (error) {
      return {
        testName: 'testPushAndForget',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  // /**
  //  *
  //  * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
  //  */
  // async testPullRemovedDocWithFilterSingleShot(): Promise<ITestResult> {
  //   return {
  //     testName: "testPullRemovedDocWithFilterSingleShot",
  //     success: false,
  //     message: "Not implemented",
  //     data: undefined,
  //   };
  // }

  // /**
  //  *
  //  * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
  //  */
  // async testPullRemovedDocWithFilterContinuous(): Promise<ITestResult> {
  //   return {
  //     testName: "testPullRemovedDocWithFilterContinuous",
  //     success: false,
  //     message: "Not implemented",
  //     data: undefined,
  //   };
  // }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStopAndRestartPushReplicationWithFilter(): Promise<ITestResult> {
    try {
      const doc1 = this.createDocumentWithIdAndData(`doc-${Date.now()}`, {
        name: 'push-pass',
      });
      await this.defaultCollection.save(doc1);

      const collectionConfig = new CollectionConfig([], []);
      ('replicatorFilter');

      collectionConfig.setPushFilter(function (document, flags) {
        'replicatorFilter';

        return document['name'].includes('push-pass');
      });

      const pushConfig = this.createConfig(
        ReplicatorType.PUSH,
        false,
        this.defaultCollection,
        collectionConfig
      );

      await this.runReplication(pushConfig);

      expect((await this.defaultCollection.count()).count).to.equal(1);

      const doc2 = this.createDocumentWithIdAndData(`doc-${Date.now()}`, {
        name: 'push-pass',
      });
      await this.defaultCollection.save(doc2);

      const doc3 = this.createDocumentWithIdAndData(`doc-${Date.now()}`, {
        name: 'not-pass',
      });
      await this.defaultCollection.save(doc3);

      await this.runReplication(pushConfig);

      expect((await this.defaultCollection.count()).count).to.equal(3);

      await this.defaultCollection.purge(doc1);
      await this.defaultCollection.purge(doc2);
      await this.defaultCollection.purge(doc3);

      const pullConfig = this.createConfig(ReplicatorType.PULL, false);

      await this.runReplication(pullConfig);

      const localDoc1 = await this.defaultCollection.document(doc1.getId());
      const localDoc2 = await this.defaultCollection.document(doc2.getId());
      const localDoc3 = await this.defaultCollection.document(doc3.getId());

      expect(localDoc1).to.not.be.undefined;
      expect(localDoc2).to.not.be.undefined;
      expect(localDoc3).to.be.undefined;

      return {
        testName: 'testStopAndRestartPushReplicationWithFilter',
        success: true,
        message: 'success',
        data: null,
      };
    } catch (error) {
      return {
        testName: 'testStopAndRestartPushReplicationWithFilter',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  // /**
  //  *
  //  * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
  //  */
  // async testStopAndRestartPullReplicationWithFilter(): Promise<ITestResult> {
  //   return {
  //     testName: "testStopAndRestartPullReplicationWithFilter",
  //     success: false,
  //     message: "Not implemented",
  //     data: undefined,
  //   };
  // }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testRemoveChangeListener(): Promise<ITestResult> {
    try {
      // Setup replicator with failing target to ensure consistent activity
      const target = new URLEndpoint(this.SYNC_GATEWAY_WRONG_URL);
      const config = new ReplicatorConfiguration(target);
      config.setMaxAttempts(2); // Allow some retries to generate events
      config.addCollection(this.defaultCollection);

      const replicator = await Replicator.create(config);

      // Setup callback tracking
      let callbacksReceived = 0;

      // Add listener and track number of invocations
      const token = await replicator.addChangeListener(() => {
        callbacksReceived++;
      });

      // Start replicator to generate events
      await replicator.start(false);

      // Allow time for callbacks to be received
      await this.sleep(1000);

      // Verify callbacks were received
      expect(callbacksReceived).to.be.greaterThan(0);
      const initialCallbacks = callbacksReceived;

      // Remove the listener
      await replicator.removeChangeListener(token);

      // Reset counter and wait for more potential events
      callbacksReceived = 0;
      await this.sleep(1000);

      // Verify no more callbacks were received after removal
      expect(callbacksReceived).to.equal(0);

      // Stop replicator
      await replicator.stop();

      return {
        testName: 'testRemoveChangeListener',
        success: true,
        message: 'Successfully verified change listener removal',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testRemoveChangeListener',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testAddRemoveChangeListenerAfterReplicatorStart(): Promise<ITestResult> {
    try {
      const target = new URLEndpoint(this.SYNC_GATEWAY_WRONG_URL);
      const config = new ReplicatorConfiguration(target);
      config.setMaxAttempts(4);
      config.setMaxAttemptWaitTime(2);
      config.addCollection(this.defaultCollection);

      const replicator = await Replicator.create(config);

      // Track callback activity
      let activityLevels: ReplicatorActivityLevel[] = [];

      // Add a listener before starting replication
      const token = await replicator.addChangeListener((change) => {
        activityLevels.push(change.status.getActivityLevel());
      });

      // Start the replicator
      await replicator.start(false);

      // Wait a moment to receive some callbacks
      await this.sleep(500);

      // Verify we got some callbacks
      expect(activityLevels.length).to.be.greaterThan(0);

      // Remember how many callbacks we received
      const callbackCount = activityLevels.length;

      // Remove the listener while replicator is running
      await replicator.removeChangeListener(token);

      // Wait again to give time for potential callbacks
      await this.sleep(500);

      // Verify we didn't receive additional callbacks after removing the listener
      expect(activityLevels.length).to.equal(callbackCount);

      return {
        testName: 'testAddRemoveChangeListenerAfterReplicatorStart',
        success: true,
        message:
          'Successfully verified removing listener after replicator start',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testAddRemoveChangeListenerAfterReplicatorStart',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testCopyingReplicatorConfiguration(): Promise<ITestResult> {
    try {
      // Create a target for configuration
      const target = new URLEndpoint(this.SYNC_GATEWAY_URL);

      // Create configuration with non-default values
      const config = new ReplicatorConfiguration(target);

      // Set authentication
      const basic = new BasicAuthenticator('abcd', '1234');
      config.setAuthenticator(basic);

      // Set non-default values for all configurable properties
      config.setContinuous(true);
      config.setHeaders({ a: 'aa', b: 'bb' });
      config.setReplicatorType(ReplicatorType.PULL);
      config.setHeartbeat(211);
      config.setMaxAttempts(223);
      config.setMaxAttemptWaitTime(227);
      config.setAcceptOnlySelfSignedCerts(true);
      config.setAllowReplicatingInBackground(true);
      config.setAutoPurgeEnabled(false);
      config.setAcceptParentDomainCookies(true);

      // Set pinnedServerCertificate
      const certificateData = 'MOCK_CERTIFICATE_DATA';
      config.setPinnedServerCertificate(certificateData);

      // Create a collection configuration with channels and document IDs
      const colConfig = new CollectionConfig(['c1', 'c2'], ['d1', 'd2']);

      // Add collection with config
      config.addCollection(this.defaultCollection);

      // Store original values for later comparison
      const originalContinuous = config.getContinuous();
      const originalReplicatorType = config.getReplicatorType();
      const originalHeartbeat = config.getHeartbeat();
      const originalMaxAttempts = config.getMaxAttempts();
      const originalMaxAttemptWaitTime = config.getMaxAttemptWaitTime();
      const originalSelfSignedCerts = config.getAcceptOnlySelfSignedCerts();
      const originalBackgroundReplication =
        config.getAllowReplicatingInBackground();
      const originalAutoPurge = config.getAutoPurgeEnabled();
      const originalParentDomainCookies = config.getAcceptParentDomainCookies();
      const originalCertificate = config.getPinnedServerCertificate();
      const originalHeaders = JSON.stringify(config.getHeaders());

      const originalAuth = config.getAuthenticator() as BasicAuthenticator;
      let originalUsername = null;
      let originalPassword = null;
      if (originalAuth && originalAuth.toJson) {
        originalUsername = originalAuth.toJson().username;
        originalPassword = originalAuth.toJson().password;
      }

      // Create a replicator with the configuration
      const replicator = await Replicator.create(config);
      await replicator.start(false);

      // Now modify the original configuration
      config.setContinuous(false);
      config.setAuthenticator(null);
      config.setHeaders(null);
      config.setReplicatorType(ReplicatorType.PUSH);
      config.setHeartbeat(11);
      config.setMaxAttempts(13);
      config.setMaxAttemptWaitTime(17);
      config.setPinnedServerCertificate(null);
      config.setAcceptOnlySelfSignedCerts(false);
      config.setAllowReplicatingInBackground(false);
      config.setAutoPurgeEnabled(true);
      config.setAcceptParentDomainCookies(false);

      // Remove the collection and add it back with a new empty config
      config.removeCollection(this.defaultCollection);
      config.addCollection(this.defaultCollection);

      // Get the configuration from the replicator
      const replicatorConfig = replicator.getConfiguration();

      // Verify the replicator's configuration still has the original values
      expect(replicatorConfig.getContinuous()).to.equal(originalContinuous);
      expect(replicatorConfig.getReplicatorType()).to.equal(
        originalReplicatorType
      );
      expect(replicatorConfig.getHeartbeat()).to.equal(originalHeartbeat);
      expect(replicatorConfig.getMaxAttempts()).to.equal(originalMaxAttempts);
      expect(replicatorConfig.getMaxAttemptWaitTime()).to.equal(
        originalMaxAttemptWaitTime
      );
      expect(replicatorConfig.getAcceptOnlySelfSignedCerts()).to.equal(
        originalSelfSignedCerts
      );
      expect(replicatorConfig.getAllowReplicatingInBackground()).to.equal(
        originalBackgroundReplication
      );
      expect(replicatorConfig.getAutoPurgeEnabled()).to.equal(
        originalAutoPurge
      );
      expect(replicatorConfig.getAcceptParentDomainCookies()).to.equal(
        originalParentDomainCookies
      );
      expect(replicatorConfig.getPinnedServerCertificate()).to.equal(
        originalCertificate
      );
      expect(JSON.stringify(replicatorConfig.getHeaders())).to.equal(
        originalHeaders
      );

      // Verify authenticator
      const replicatorAuth =
        replicatorConfig.getAuthenticator() as BasicAuthenticator;
      expect(replicatorAuth).to.not.be.null;

      if (replicatorAuth && replicatorAuth.toJson) {
        expect(replicatorAuth.toJson().username).to.equal(originalUsername);
        expect(replicatorAuth.toJson().password).to.equal(originalPassword);
      }

      // Verify collection configuration
      const collectionConfig = replicatorConfig.getCollectionConfig(
        this.defaultCollection
      );
      expect(collectionConfig).to.not.be.null;

      // Clean up
      await replicator.stop();
      await replicator.cleanup();

      return {
        testName: 'testCopyingReplicatorConfiguration',
        success: true,
        message: 'Successfully verified replicator configuration independence',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCopyingReplicatorConfiguration',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testReplicationConfigSetterMethods(): Promise<ITestResult> {
    try {
      // Create a target for our configuration
      const target = new URLEndpoint(this.SYNC_GATEWAY_URL);
      const config = new ReplicatorConfiguration(target);

      // Configure authentication
      const basic = new BasicAuthenticator('test_user', 'test_password');
      config.setAuthenticator(basic);

      // Set various configuration properties
      config.setContinuous(true);
      config.setHeaders({
        'Custom-Header': 'test-value',
        'X-App-ID': 'test-app',
      });
      config.setReplicatorType(ReplicatorType.PULL);
      config.setHeartbeat(120);
      config.setMaxAttempts(5);
      config.setMaxAttemptWaitTime(180);
      config.setAcceptOnlySelfSignedCerts(true);
      config.setAllowReplicatingInBackground(true);
      config.setAutoPurgeEnabled(false);
      config.setAcceptParentDomainCookies(true);

      // Set a mock certificate
      const mockCertificate = 'MOCK_CERTIFICATE_DATA';
      config.setPinnedServerCertificate(mockCertificate);

      // Configure collection
      const collectionConfig = new CollectionConfig(
        ['channel1', 'channel2'],
        ['doc1', 'doc2']
      );

      config.addCollection(this.defaultCollection, collectionConfig);

      // Verify all getter methods return the values we set
      expect(config.getContinuous()).to.be.true;

      const auth = config.getAuthenticator() as BasicAuthenticator;
      expect(auth).to.not.be.null;

      expect(auth.toJson().username).to.equal('test_user');
      expect(auth.toJson().password).to.equal('test_password');

      expect(config.getHeaders()).to.deep.equal({
        'Custom-Header': 'test-value',
        'X-App-ID': 'test-app',
      });

      expect(config.getReplicatorType()).to.equal(ReplicatorType.PULL);
      expect(config.getHeartbeat()).to.equal(120);
      expect(config.getMaxAttempts()).to.equal(5);
      expect(config.getMaxAttemptWaitTime()).to.equal(180);
      expect(config.getPinnedServerCertificate()).to.equal(mockCertificate);
      expect(config.getAcceptOnlySelfSignedCerts()).to.be.true;
      expect(config.getAllowReplicatingInBackground()).to.be.true;
      expect(config.getAutoPurgeEnabled()).to.be.false;
      expect(config.getAcceptParentDomainCookies()).to.be.true;

      // Verify collection config
      const retrievedCollectionConfig = config.getCollectionConfig(
        this.defaultCollection
      );
      expect(retrievedCollectionConfig).to.not.be.null;

      // Now create a replicator with this configuration
      const replicator = await Replicator.create(config);

      // Get the configuration from the replicator
      const replicatorConfig = replicator.getConfiguration();

      // Verify the replicator has the same configuration values
      expect(replicatorConfig.getContinuous()).to.be.true;

      const replicatorAuth =
        replicatorConfig.getAuthenticator() as BasicAuthenticator;
      expect(replicatorAuth).to.not.be.null;

      const authData = replicatorAuth.toJson();
      expect(authData.username).to.equal('test_user');
      expect(authData.password).to.equal('test_password');

      expect(replicatorConfig.getHeaders()).to.deep.equal({
        'Custom-Header': 'test-value',
        'X-App-ID': 'test-app',
      });

      expect(replicatorConfig.getReplicatorType()).to.equal(
        ReplicatorType.PULL
      );
      expect(replicatorConfig.getHeartbeat()).to.equal(120);
      expect(replicatorConfig.getMaxAttempts()).to.equal(5);
      expect(replicatorConfig.getMaxAttemptWaitTime()).to.equal(180);
      expect(replicatorConfig.getPinnedServerCertificate()).to.equal(
        mockCertificate
      );
      expect(replicatorConfig.getAcceptOnlySelfSignedCerts()).to.be.true;
      expect(replicatorConfig.getAllowReplicatingInBackground()).to.be.true;
      expect(replicatorConfig.getAutoPurgeEnabled()).to.be.false;
      expect(replicatorConfig.getAcceptParentDomainCookies()).to.be.true;

      return {
        testName: 'testReplicationConfigSetterMethods',
        success: true,
        message:
          'Successfully verified setter methods and replicator configuration',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testReplicationConfigSetterMethods',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }

  async testReplicatorConfigurationImmutability(): Promise<ITestResult> {
    try {
      const target = new URLEndpoint(this.SYNC_GATEWAY_URL);
      const config = new ReplicatorConfiguration(target);

      config.setContinuous(true);
      config.addCollection(this.defaultCollection);
      const replicator = await Replicator.create(config);

      // Modify the original configuration
      config.setContinuous(false);

      // Verify that the replicator's configuration is unchanged
      const replicatorConfig = replicator.getConfiguration();
      if (replicatorConfig.getContinuous() !== true) {
        throw new Error('Replicator configuration was modified');
      }

      return {
        testName: 'testReplicatorConfigurationImmutability',
        success: true,
        message: 'Replicator configuration is immutable',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testReplicatorConfigurationImmutability',
        success: false,
        message: error.message || JSON.stringify(error),
        data: undefined,
      };
    }
  }

  async testFilterPushPerformance(): Promise<ITestResult> {
    const docCount = 5000;
    try {
      const docs = await this.createDocs(docCount);

      const collConfig = new CollectionConfig(undefined, undefined);
      collConfig.setPushFilter((doc, flags) => {
        'replicatorFilter';
        return Boolean(doc['number'] % 2);
      });

      const pushConfig = this.createConfig(
        ReplicatorType.PUSH,
        false,
        this.defaultCollection,
        collConfig
      );

      const startTime = Date.now();
      await this.runReplication(pushConfig);
      const duration = Date.now() - startTime;

      docs.forEach((doc) => this.defaultCollection.purgeById(doc.getId()));

      const pullConfig = this.createConfig(
        ReplicatorType.PULL,
        false,
        this.defaultCollection
      );

      await this.runReplication(pullConfig);

      const filterQuery = this.database.createQuery(`
            SELECT COUNT(*) as count
            FROM _default._default
            WHERE number % 2 = 1
        `);

      const [{ count }] = await filterQuery.execute();

      expect(count).to.be.above(0);
      expect(count).to.be.below(docCount);

      return {
        testName: 'testFilterPushPerformance',
        success: true,
        message: `Filter performance test completed successfully: docs ${docCount} - time ${duration} ms`,
        data: null,
      };
    } catch (error) {
      return {
        testName: 'testFilterPerformance',
        success: false,
        message: `${error}`,
        data: error.stack || error.toString(),
      };
    }
  }
}
