import { TestCase } from "./test-case";
import { ITestResult } from "./test-result.types";
import {
  BasicAuthenticator,
  Replicator,
  ReplicatorActivityLevel,
  ReplicatorConfiguration,
  ReplicatorType,
  URLEndpoint,
  Collection,
  CollectionConfig
} from "cblite-js";
import { expect } from "chai";

/**
 * ReplicatorTests - reminder all test cases must start with 'test' in the name of the method or they will not run
 * */

 /**
  Replicator tests require local setup of Couchbase Server and Sync Gate to pass. 
  See the readme file for setup instructions. https://github.com/Couchbase-Ecosystem/cblite-js-tests/blob/main/README.md
 */

export class ReplicatorTests extends TestCase {
  constructor() {
    super();
  }

  private readonly SYNC_GATEWAY_URL = "ws://localhost:4984/projects";
  private readonly TEST_USERNAME = "demo@example.com";
  private readonly TEST_PASSWORD = "P@ssw0rd12";


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

  private async runReplication(config: ReplicatorConfiguration, reset: boolean = false,): Promise<void> {
    const replicator = await Replicator.create(config);
    

    let listenerToken: string;
    const completionPromise = new Promise<void>((resolve, reject) => {
      replicator.addChangeListener((change) => {
        const status = change.status;
        const activityLevel = status.getActivityLevel();

        if (config.getContinuous() && activityLevel === ReplicatorActivityLevel.IDLE) {
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
      }).then(token => {
        listenerToken = token;
      });
    });
    
    try {
      await replicator.start(reset);
      await completionPromise;
    } catch (e) {
      console.error(e)
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
    const target = new URLEndpoint("ws://localhost:4984/db");
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
        testName: "testReplicatorConfigDefaultValues",
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: "testReplicatorConfigDefaultValues",
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
      //this is using the replication configuration from the Android Kotlin Learning path
      //**TODO update to use the new configuration and endpoint**
      const target = new URLEndpoint("ws://localhost:4984/projects");
      const auth = new BasicAuthenticator("demo@example.com", "P@ssw0rd12");
      const config = new ReplicatorConfiguration(target);
      config.addCollection(this.defaultCollection);
      config.setAuthenticator(auth);

      let isError = false;
      let didGetChangeStatus = false;

      const replicator = await Replicator.create(config);
      const token = await replicator.addChangeListener((change) => {
        //check to see if there was an error
        const error = change.status.getError();
        if (error !== undefined) {
          isError = true;
        }
        //get the status of the replicator using ReplicatorActivityLevel enum
        if (change.status.getActivityLevel() === ReplicatorActivityLevel.IDLE) {
          //do something because the replicator is now IDLE
        }
        didGetChangeStatus = true;
      });

      //don't start with a new checkpoint by passing false to the start method
      await replicator.start(false);
      //we need to sleep to wait for the documents to replicate, no one would ever normally do this
      //don't include in docs
      await this.sleep(5000);

      //this mimics what someone would do when the app needs to close to properly clean up the
      //replicator and processes
      await replicator.removeChangeListener(token);
      await replicator.stop();

      //validate we got documents replicated
      const count = await this.defaultCollection.count();
      console.log('listener count: ', count)
      expect(count.count).to.be.greaterThan(0);

      //validate our listener was called and there wasn't errors
      expect(isError).to.be.false;
      expect(didGetChangeStatus).to.be.true;

      return {
        testName: "testReplicationStatusChangeListenerEvent",
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: "testReplicationStatusChangeListenerEvent",
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
      //this is using the replication configuration from the Android Kotlin Learning path
      //**TODO update to use the new configuration and endpoint**
      const target = new URLEndpoint("ws://localhost:4984/projects");
      const auth = new BasicAuthenticator("demo@example.com", "P@ssw0rd12");
      const config = new ReplicatorConfiguration(target);
      config.addCollection(this.defaultCollection);
      config.setAuthenticator(auth);

      let isError = false;
      let didGetDocumentUpdate = false;

      const replicator = await Replicator.create(config);

      const token = await replicator.addDocumentChangeListener((change) => {
        //check to see if the documents were pushed or pulled
        //if isPush is true then the documents were pushed, else it was pulled
        const isPush = change.isPush;
        //loop through documents
        for (const doc of change.documents) {
          //details of each document along with if there was an error on that doc
          const id = doc.id;
          const flags = doc.flags;
          const error = doc.error;
          if (error !== undefined) {
            isError = true;
          }
        }
        didGetDocumentUpdate = true;
      });

      //don't start with a new checkpoint by passing false to the start method
      await replicator.start(false);
      //we need to sleep to wait for the documents to replicate, no one would ever normally do this
      //don't include in docs
      await this.sleep(5000);

      //this mimics what someone would do when the app needs to close to properly clean up the
      //replicator and processes
      await replicator.removeChangeListener(token);
      await replicator.stop();

      //validate we got documents replicated
      const count = await this.defaultCollection.count();
      expect(count.count).to.be.greaterThan(0);

      //validate our listener was called and there wasn't erorrs
      expect(isError).to.be.false;
      expect(didGetDocumentUpdate).to.be.true;

      return {
        testName: "testDocumentChangeListenerEvent",
        success: true,
        message: `success`,
        data: undefined,
      };
    } catch (error) {
      return {
        testName: "testDocumentChangeListenerEvent",
        success: false,
        message: `Error:${error}`,
        data: undefined,
      };
    }
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testEmptyPush(): Promise<ITestResult> {
    return {
      testName: "testEmptyPush",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStartWithCheckpoint(): Promise<ITestResult> {
    return {
      testName: "testStartWithCheckpoint",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStartWithResetCheckpointContinuous(): Promise<ITestResult> {
    return {
      testName: "testStartWithResetCheckpointContinuous",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testRemoveDocumentReplicationListener(): Promise<ITestResult> {
    return {
      testName: "testRemoveDocumentReplicationListener",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testDocumentReplicationEventWithPushConflict(): Promise<ITestResult> {
    return {
      testName: "testDocumentReplicationEventWithPushConflict",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testDocumentReplicationEventWithPullConflict(): Promise<ITestResult> {
    return {
      testName: "testDocumentReplicationEventWithPullConflict",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testDocumentReplicationEventWithDeletion(): Promise<ITestResult> {
    return {
      testName: "testDocumentReplicationEventWithDeletion",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
async testSingleShotPushFilter(): Promise<ITestResult> {
  try {
    // Create test documents with unique IDs
    const doc1Id = `test-doc-1-${Date.now()}`
    const doc1 = this.createDocumentWithIdAndData(doc1Id, {
      name: 'should-push', 
      documentType: 'project', 
      team: 'team1'
    })
    await this.defaultCollection.save(doc1)

    const doc2Id = `test-doc-2-${Date.now()}`
    const doc2 = this.createDocumentWithIdAndData(doc2Id, {
      name: 'not-push', 
      documentType: 'project', 
      team: 'team1'
    })
    await this.defaultCollection.save(doc2)

    // Create collection config with push filter
    const collectionConfig = new CollectionConfig();
    collectionConfig.setPushFilter((doc) => {
      "show source";
      
      return doc.name !== 'not-push';
    })

    // Create replicator with push filter
    const replConfig = this.createConfig(
      ReplicatorType.PUSH, 
      false, // not continuous (single shot)
      this.defaultCollection,
      collectionConfig
    )

    // Run the replication
    await this.runReplication(replConfig);

    // Clean local database and pull from Sync Gateway to verify which documents were pushed
    await this.defaultCollection.purgeById(doc1Id);
    await this.defaultCollection.purgeById(doc2Id);
    
    // Verify documents were purged
    expect(await this.defaultCollection.getDocument(doc1Id)).to.be.undefined;
    expect(await this.defaultCollection.getDocument(doc2Id)).to.be.undefined;

    // Pull from Sync Gateway without filter
    const pullConfig = this.createConfig(ReplicatorType.PULL, false, this.defaultCollection);
    await this.runReplication(pullConfig);

    // Verify doc1 was pushed (should be pulled back)
    const replicatedDoc = await this.defaultCollection.getDocument(doc1Id);
    expect(replicatedDoc).to.not.be.undefined;
    expect(replicatedDoc.getData().name).to.equal('should-push');

    // Verify doc2 was not pushed (should not be pulled back)
    expect(await this.defaultCollection.getDocument(doc2Id)).to.be.undefined;

    return {
      testName: "testSingleShotPushFilter",
      success: true,
      message: "success",
      data: undefined,
    };
  } catch (error) {
    return {
      testName: "testSingleShotPushFilter",
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
async testContinuousPushFilter(): Promise<ITestResult> {
  try {
    // Create collection config with push filter
    const collectionConfig = new CollectionConfig();
    collectionConfig.setPushFilter((doc) => {
      "show source";
      return !doc.name.includes('not-push');
    })

    // Create replicator with push filter (continuous = true)
    const replConfig = this.createConfig(
      ReplicatorType.PUSH, 
      true, // continuous
      this.defaultCollection,
      collectionConfig
    )

    // Start the continuous replicator manually
    const replicator = await Replicator.create(replConfig);
    let listenerToken: string;
    
    // Set up a listener to track status changes
    await new Promise<void>((resolve) => {
      replicator.addChangeListener((change) => {
        const status = change.status;
        if (status.getActivityLevel() === ReplicatorActivityLevel.IDLE) {
          resolve();
        }
      }).then(token => {
        listenerToken = token;
      });
      
      replicator.start(false);
    });
    
    // Create documents while the continuous replicator is running
    const doc1Id = `test-doc-1-${Date.now()}`
    const doc1 = this.createDocumentWithIdAndData(doc1Id, {
      name: 'should-push-continuous', 
      documentType: 'project', 
      team: 'team1'
    })
    await this.defaultCollection.save(doc1)
    
    const doc2Id = `test-doc-2-${Date.now()}`
    const doc2 = this.createDocumentWithIdAndData(doc2Id, {
      name: 'not-push-continuous', 
      documentType: 'project', 
      team: 'team1'
    })
    await this.defaultCollection.save(doc2)
    
    // Give the continuous replicator time to process the new documents
    await this.sleep(100);
    
    // Stop the replicator
    await replicator.stop();
    await replicator.removeChangeListener(listenerToken);
    
    // Clean local database
    await this.defaultCollection.purgeById(doc1Id);
    await this.defaultCollection.purgeById(doc2Id);
    
    // Pull to verify what was pushed
    const pullConfig = this.createConfig(ReplicatorType.PULL, false, this.defaultCollection);
    await this.runReplication(pullConfig);
    
    // Verify doc1 was pushed and doc2 was filtered
    const doc1After = await this.defaultCollection.getDocument(doc1Id);
    const doc2After = await this.defaultCollection.getDocument(doc2Id);
    
    expect(doc1After).to.not.be.undefined;
    expect(doc1After.getData().name).to.equal('should-push-continuous');
    expect(doc2After).to.be.undefined;

    return {
      testName: "testContinuousPushFilter",
      success: true,
      message: "success",
      data: undefined,
    };
  } catch (error) {
    return {
      testName: "testContinuousPushFilter",
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
  async testPullFilter(): Promise<ITestResult> {
    try {
    const doc1Id = `test-doc-1-${Date.now()}`
    const doc1 =this.createDocumentWithIdAndData(doc1Id, {name: 'not-pull', documentType: 'project', team: 'team1'})
    this.defaultCollection.save(doc1)

    const doc2Id = `test-doc-2-${Date.now()}`
    const doc2 = this.createDocumentWithIdAndData(doc2Id, {name: 'pull', documentType: 'project', team: 'team1'})
    this.defaultCollection.save(doc2)
    
   

    const replPushConfig = this.createConfig(ReplicatorType.PUSH, false, this.defaultCollection)
    await this.runReplication(replPushConfig);

    this.defaultCollection.purgeById(doc1Id)
    this.defaultCollection.purgeById(doc2Id)

    expect(await this.defaultCollection.getDocument(doc1Id)).to.be.undefined;  
    expect(await this.defaultCollection.getDocument(doc2Id)).to.be.undefined;  
    
    const collectionConfig = new CollectionConfig();

    collectionConfig.setPullFilter((doc) => {
      "show source";

      return doc.name !== 'not-pull';
    })

    const replPullConfig = this.createConfig(ReplicatorType.PULL, false, this.defaultCollection,collectionConfig)

    await this.runReplication(replPullConfig);

    const replicatedDoc = await this.defaultCollection.getDocument(doc2Id);
    expect(await this.defaultCollection.getDocument(doc1Id)).to.be.undefined;  
    expect(replicatedDoc).to.not.be.undefined; 
    expect(replicatedDoc.getData().name).to.be.equal('pull'); 
  
    return {
            testName: "testPullFilter",
            success: true,
            message: "success",
            data: undefined,
          };
        } catch (error) {
          return {
            testName: "testPullFilter",
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
  async testPushAndForget(): Promise<ITestResult> {
    return {
      testName: "testPushAndForget",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

//   /**
//    *
//    * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
//    */
// async testPullRemovedDocWithFilterSingleShot(): Promise<ITestResult> {

// NOT WORKING

//   try {
//     // Create two documents with specific IDs
//     const doc1Id = `doc1-${Date.now()}`;
//     const passDocId = `pass-${Date.now()}`;
    
//     // Create documents locally
//     const doc1 = this.createDocumentWithIdAndData(doc1Id, {
//       name: "pass",
//       documentType: "project",
//       team: "team1"
//     });
    
//     const passDoc = this.createDocumentWithIdAndData(passDocId, {
//       name: "pass",
//       documentType: "project", 
//       team: "team1"
//     });
    
//     // Save documents locally and push to Sync Gateway
//     await this.defaultCollection.save(doc1);
//     await this.defaultCollection.save(passDoc);
    
//     const pushConfig = this.createConfig(ReplicatorType.PUSH, false);
//     await this.runReplication(pushConfig);
    
//     // Create and open a second database instance
//     if (!this.otherDatabase) {
//       this.otherDatabase = await this.getDatabase(this.otherDatabaseName, this.directory, "");
//       await this.otherDatabase.open();
//     }
    
//     const otherCollection = await this.otherDatabase.defaultCollection();
    
//     // Pull documents into other database
//     const otherPullConfig = this.createConfig(ReplicatorType.PULL, false, otherCollection);
//     await this.runReplication(otherPullConfig);
    
//     // Delete both documents in the other database
//     const otherDoc1 = await otherCollection.getDocument(doc1Id);
//     const otherPassDoc = await otherCollection.getDocument(passDocId);
    
//     await otherCollection.purge(otherDoc1);
//     await otherCollection.purge(otherPassDoc);
    
//     // Push deletions back to server
//     await this.runReplication(otherPullConfig.getReplicatorType(ReplicatorType.PUSH));
    
//     // Delete documents locally to prepare for filtered pull
//     await this.defaultCollection.purge(doc1);
//     await this.defaultCollection.purge(passDoc);
    
//     // Create collection config with pull filter for deletions
//     const collectionConfig = new CollectionConfig();
//     collectionConfig.setPullFilter((doc, flags) => {
//       // Check if document is deleted
//       "show source"

//       const isDeleted = flags.includes("deleted");
      
//       if (isDeleted) {
//         // For deletions, only allow those with "pass" in the ID
//         return doc.id.includes("pass");
//       }
      
//       // For regular documents, allow all with name "pass"
//       return doc.name === "pass";
//     });
    
//     // Pull with filter to test deletion handling
//     const pullConfig = this.createConfig(ReplicatorType.PULL, false, this.defaultCollection, collectionConfig);
//     await this.runReplication(pullConfig);
    
//     // Try to get documents locally after filtered pull
//     const localDoc1 = await this.defaultCollection.getDocument(doc1Id);
//     const localPassDoc = await this.defaultCollection.getDocument(passDocId);
    
//     // Verify filter worked:
//     // - doc1 should still exist (deletion rejected by filter)
//     // - passDoc should be deleted (deletion allowed by filter)
//     expect(localDoc1).to.not.be.undefined;
//     expect(localPassDoc).to.be.undefined;
    
//     return {
//       testName: "testPullRemovedDocWithFilterSingleShot",
//       success: true,
//       message: "Successfully verified pull filter for selective deletions",
//       data: undefined
//     };
//   } catch (error) {
//     return {
//       testName: "testPullRemovedDocWithFilterSingleShot",
//       success: false,
//       message: `${error}`,
//       data: error.stack || error.toString()
//     };
//   }
// }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testPullRemovedDocWithFilterContinuous(): Promise<ITestResult> {
    return {
      testName: "testPullRemovedDocWithFilterContinuous",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStopAndRestartPushReplicationWithFilter(): Promise<ITestResult> {
    return {
      testName: "testStopAndRestartPushReplicationWithFilter",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testStopAndRestartPullReplicationWithFilter(): Promise<ITestResult> {
    return {
      testName: "testStopAndRestartPullReplicationWithFilter",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testRemoveChangeListener(): Promise<ITestResult> {
    return {
      testName: "testRemoveChangeListener",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testAddRemoveChangeListenerAfterReplicatorStart(): Promise<ITestResult> {
    return {
      testName: "testAddRemoveChangeListenerAfterReplicatorStart",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testCopyingReplicatorConfiguration(): Promise<ITestResult> {
    return {
      testName: "testCopyingReplicatorConfiguration",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }

  /**
   *
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
   */
  async testReplicationConfigSetterMethods(): Promise<ITestResult> {
    return {
      testName: "testReplicationConfigSetterMethods",
      success: false,
      message: "Not implemented",
      data: undefined,
    };
  }
}
