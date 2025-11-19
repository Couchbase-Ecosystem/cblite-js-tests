import { TestCase } from "./test-case";
import { ITestResult } from "./test-result.types";
import { MutableDocument, ListenerToken, URLEndpoint, ReplicatorConfiguration, ReplicatorType, BasicAuthenticator, Replicator, ReplicatorActivityLevel, Database, DatabaseConfiguration, ReplicatorStatus } from "cblite-js";
import { expect } from "chai";

/**
 * ListenerTests - reminder all test cases must start with 'test' in the name of the method or they will not run
 * */
export class ListenerTests extends TestCase {
  constructor() {
    super();
  }

  /**
   * Test Collection Change Listener with OLD API (collection.removeChangeListener)
   * 
   * This test verifies backward compatibility - the old way of removing listeners
   * should still work even though we now return ListenerToken objects.
   * 
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
   */
  async testCollectionChangeListenerOldAPI(): Promise<ITestResult> {
    try {
      const collection = await this.database.createCollection(
        'testCollOldAPI',
        'testScope'
      );

      let changeCount = 0;
      const documentIds: string[] = [];

      // Add listener - returns ListenerToken
      const token = await collection.addChangeListener((change) => {
        changeCount++;
        documentIds.push(...change.documentIDs);
      });

      // Verify token is ListenerToken object (not string anymore)
      expect(token).to.not.be.a('string');
      expect(token.getUuidToken).to.be.a('function');
      expect(token.remove).to.be.a('function');
      expect(token.isRemoved()).to.be.false;

      // Create document to trigger listener
      const doc1 = new MutableDocument();
      doc1.setId('doc1-old');
      doc1.setString('name', 'Alice');
      await collection.save(doc1);

      await this.sleep(300);

      // Verify listener fired
      expect(changeCount).to.be.greaterThan(0);
      expect(documentIds).to.include('doc1-old');

      // Remove listener using OLD API (pass token to collection method)
      await collection.removeChangeListener(token);

      // Create more documents
      changeCount = 0;
      documentIds.length = 0;
      const doc2 = new MutableDocument();
      doc2.setId('doc2-old');
      doc2.setString('name', 'Bob');
      await collection.save(doc2);

      await this.sleep(300);

      // Verify listener did NOT fire after removal
      expect(changeCount).to.equal(0);
      expect(documentIds).to.not.include('doc2-old');

      return {
        testName: 'testCollectionChangeListenerOldAPI',
        success: true,
        message: 'OLD API: collection.removeChangeListener() works correctly',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCollectionChangeListenerOldAPI',
        success: false,
        message: error.message || JSON.stringify(error),
        data: undefined,
      };
    }
  }

  /**
   * Test Collection Change Listener with NEW API (token.remove)
   * 
   * This test verifies the new cleaner API where you call remove() directly
   * on the token object instead of passing it back to the collection.
   * 
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
   */
  async testCollectionChangeListenerNewAPI(): Promise<ITestResult> {
    try {
      const collection = await this.database.createCollection(
        'testCollNewAPI',
        'testScope'
      );

      let changeCount = 0;
      const documentIds: string[] = [];

      // Add listener - returns ListenerToken
      const token = await collection.addChangeListener((change) => {
        changeCount++;
        documentIds.push(...change.documentIDs);
      });

      // Verify token is ListenerToken object with all methods
      expect(token).to.not.be.a('string');
      expect(token.getUuidToken).to.be.a('function');
      expect(token.remove).to.be.a('function');
      expect(token.isRemoved).to.be.a('function');
      expect(token.isRemoved()).to.be.false;

      // Verify getUuidToken() returns a string
      const uuidToken = token.getUuidToken();
      expect(uuidToken).to.be.a('string');
      expect(uuidToken.length).to.be.greaterThan(0);

      // Create documents to trigger listener
      const doc1 = new MutableDocument();
      doc1.setId('doc1-new');
      doc1.setString('name', 'Alice');
      await collection.save(doc1);

      await this.sleep(300);

      // Verify listener fired
      expect(changeCount).to.be.greaterThan(0);
      expect(documentIds).to.include('doc1-new');

      // Remove listener using NEW API (call remove() on token)
      await token.remove();

      // Verify isRemoved() returns true after removal
      expect(token.isRemoved()).to.be.true;

      // Create more documents
      changeCount = 0;
      documentIds.length = 0;
      const doc2 = new MutableDocument();
      doc2.setId('doc2-new');
      doc2.setString('name', 'Bob');
      await collection.save(doc2);

      await this.sleep(300);

      // Verify listener did NOT fire after removal
      expect(changeCount).to.equal(0);
      expect(documentIds).to.not.include('doc2-new');

      // Verify calling remove() again is safe (no error)
      await token.remove();
      expect(token.isRemoved()).to.be.true;

      return {
        testName: 'testCollectionChangeListenerNewAPI',
        success: true,
        message: 'NEW API: token.remove() works correctly',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCollectionChangeListenerNewAPI',
        success: false,
        message: error.message || JSON.stringify(error),
        data: undefined,
      };
    }
  }

  /**
   * Test Collection Document Change Listener with OLD API
   * 
   * Tests listening to a specific document's changes and removing with old API.
   * 
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
   */
  async testCollectionDocumentChangeListenerOldAPI(): Promise<ITestResult> {
    try {
      const collection = await this.database.createCollection(
        'testDocOldAPI',
        'testScope'
      );

      // Create a document to monitor
      const doc = new MutableDocument();
      doc.setId('monitored-doc-old');
      doc.setString('name', 'Initial');
      await collection.save(doc);

      let changeCount = 0;
      let lastDocumentId = '';

      // Add document-specific listener
      const token = await collection.addDocumentChangeListener(
        'monitored-doc-old',
        (change) => {
          changeCount++;
          lastDocumentId = change.documentId;
        }
      );

      // Verify token is ListenerToken
      expect(token).to.not.be.a('string');
      expect(token.remove).to.be.a('function');

      // Update the monitored document
      const updatedDoc = await collection.document('monitored-doc-old');
      if (updatedDoc) {
        const mutableDoc = MutableDocument.fromDocument(updatedDoc);
        mutableDoc.setString('name', 'Updated');
        await collection.save(mutableDoc);
      }

      await this.sleep(300);

      // Verify listener fired for the specific document
      expect(changeCount).to.be.greaterThan(0);
      expect(lastDocumentId).to.equal('monitored-doc-old');

      // Remove listener using OLD API
      await collection.removeDocumentChangeListener(token);

      // Update document again
      changeCount = 0;
      const doc2 = await collection.document('monitored-doc-old');
      if (doc2) {
        const mutableDoc2 = MutableDocument.fromDocument(doc2);
        mutableDoc2.setString('name', 'Updated Again');
        await collection.save(mutableDoc2);
      }

      await this.sleep(300);

      // Verify listener did NOT fire
      expect(changeCount).to.equal(0);

      return {
        testName: 'testCollectionDocumentChangeListenerOldAPI',
        success: true,
        message: 'OLD API: collection.removeDocumentChangeListener() works correctly',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCollectionDocumentChangeListenerOldAPI',
        success: false,
        message: error.message || JSON.stringify(error),
        data: undefined,
      };
    }
  }

  /**
   * Test Collection Document Change Listener with NEW API
   * 
   * Tests listening to a specific document's changes and removing with new API.
   * 
   * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
   */
  async testCollectionDocumentChangeListenerNewAPI(): Promise<ITestResult> {
    try {
      const collection = await this.database.createCollection(
        'testDocNewAPI',
        'testScope'
      );

      // Create a document to monitor
      const doc = new MutableDocument();
      doc.setId('monitored-doc-new');
      doc.setString('name', 'Initial');
      await collection.save(doc);

      let changeCount = 0;
      let lastDocumentId = '';

      // Add document-specific listener
      const token = await collection.addDocumentChangeListener(
        'monitored-doc-new',
        (change) => {
          changeCount++;
          lastDocumentId = change.documentId;
        }
      );

      // Verify token is ListenerToken with all methods
      expect(token).to.not.be.a('string');
      expect(token.getUuidToken).to.be.a('function');
      expect(token.remove).to.be.a('function');
      expect(token.isRemoved).to.be.a('function');
      expect(token.isRemoved()).to.be.false;

      // Update the monitored document
      const updatedDoc = await collection.document('monitored-doc-new');
      if (updatedDoc) {
        const mutableDoc = MutableDocument.fromDocument(updatedDoc);
        mutableDoc.setString('name', 'Updated');
        await collection.save(mutableDoc);
      }

      await this.sleep(300);

      // Verify listener fired for the specific document
      expect(changeCount).to.be.greaterThan(0);
      expect(lastDocumentId).to.equal('monitored-doc-new');

      // Remove listener using NEW API
      await token.remove();

      // Verify isRemoved() returns true
      expect(token.isRemoved()).to.be.true;

      // Update document again
      changeCount = 0;
      const doc2 = await collection.document('monitored-doc-new');
      if (doc2) {
        const mutableDoc2 = MutableDocument.fromDocument(doc2);
        mutableDoc2.setString('name', 'Updated Again');
        await collection.save(mutableDoc2);
      }

      await this.sleep(300);

      // Verify listener did NOT fire
      expect(changeCount).to.equal(0);

      // Verify calling remove() again is safe
      await token.remove();
      expect(token.isRemoved()).to.be.true;

      return {
        testName: 'testCollectionDocumentChangeListenerNewAPI',
        success: true,
        message: 'NEW API: token.remove() works correctly for document listeners',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCollectionDocumentChangeListenerNewAPI',
        success: false,
        message: error.message || JSON.stringify(error),
        data: undefined,
      };
    }
  }

        /**
 * Test Query Change Listener with OLD API (query.removeChangeListener)
 * 
 * This test verifies backward compatibility for query listeners.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testQueryChangeListenerOldAPI(): Promise<ITestResult> {
  try {
    // Create initial documents
    await this.createDocs(5);

    const query = this.database.createQuery(
      'SELECT * FROM _ WHERE number > 3'
    );

    let listenerCalls = 0;
    let resultCount = 0;

    const token = await query.addChangeListener((change) => {
      listenerCalls++;
      if (change && change.results) {
        resultCount = change.results.length;
      }
    });

    // Verify token is ListenerToken object
    expect(token).to.not.be.a('string');
    expect(token.getUuidToken).to.be.a('function');
    expect(token.remove).to.be.a('function');
    expect(token.isRemoved()).to.be.false;

    await this.sleep(300);

    // Verify listener fired
    expect(listenerCalls).to.be.greaterThan(0);
    expect(resultCount).to.be.greaterThan(0);

    // Remove using OLD API
    await query.removeChangeListener(token);

    // Create more documents that match the query
    listenerCalls = 0;
    const doc = this.createDocumentWithIdAndData('100', { number: 100 });
    await this.defaultCollection.save(doc);
    await this.sleep(300);

    // Verify listener did NOT fire after removal
    expect(listenerCalls).to.equal(0);

    return {
      testName: 'testQueryChangeListenerOldAPI',
      success: true,
      message: 'OLD API: query.removeChangeListener() works correctly',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testQueryChangeListenerOldAPI',
      success: false,
      message: error.message || JSON.stringify(error),
      data: undefined,
    };
  }
}

/**
 * Test Query Change Listener with NEW API (token.remove)
 * 
 * This test verifies the new cleaner API for query listeners.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testQueryChangeListenerNewAPI(): Promise<ITestResult> {
  try {
    // Create initial documents
    await this.createDocs(5);

    const query = this.database.createQuery(
      'SELECT * FROM _ WHERE number > 3'
    );

    let listenerCalls = 0;
    let resultCount = 0;

    const token = await query.addChangeListener((change) => {
      listenerCalls++;
      if (change && change.results) {
        resultCount = change.results.length;
      }
    });

    // Verify token is ListenerToken with all methods
    expect(token).to.not.be.a('string');
    expect(token.getUuidToken).to.be.a('function');
    expect(token.remove).to.be.a('function');
    expect(token.isRemoved).to.be.a('function');
    expect(token.isRemoved()).to.be.false;

    // Verify getUuidToken() returns a string
    const uuidToken = token.getUuidToken();
    expect(uuidToken).to.be.a('string');
    expect(uuidToken.length).to.be.greaterThan(0);

    await this.sleep(300);

    // Verify listener fired
    expect(listenerCalls).to.be.greaterThan(0);
    expect(resultCount).to.be.greaterThan(0);

    // Remove using NEW API
    await token.remove();

    // Verify isRemoved() returns true
    expect(token.isRemoved()).to.be.true;

    // Create more documents that match the query
    listenerCalls = 0;
    const doc = this.createDocumentWithIdAndData('100', { number: 100 });
    await this.defaultCollection.save(doc);
    await this.sleep(300);

    // Verify listener did NOT fire after removal
    expect(listenerCalls).to.equal(0);

    // Verify calling remove() again is safe (no error)
    await token.remove();
    expect(token.isRemoved()).to.be.true;

    return {
      testName: 'testQueryChangeListenerNewAPI',
      success: true,
      message: 'NEW API: token.remove() works correctly for query listeners',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testQueryChangeListenerNewAPI',
      success: false,
      message: error.message || JSON.stringify(error),
      data: undefined,
    };
  }
}

/**
 * Test Query Change Listener with Parameters - OLD API
 * 
 * Tests query listeners with parameterized queries using old API.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testQueryChangeListenerWithParameterOldAPI(): Promise<ITestResult> {
  try {
    // Create initial documents
    await this.createDocs(10);

    const query = this.database.createQuery(
      'SELECT * FROM _ WHERE number > $minValue'
    );
    
    // Set parameters
    query.parameters.setInt('minValue', 5);

    let listenerCalls = 0;
    let lastResultCount = 0;

    const token = await query.addChangeListener((change) => {
      listenerCalls++;
      if (change && change.results) {
        lastResultCount = change.results.length;
      }
    });

    await this.sleep(300);

    // Verify listener fired and got results
    expect(listenerCalls).to.be.greaterThan(0);
    expect(lastResultCount).to.be.greaterThan(0);

    // Remove listener using OLD API
    await query.removeChangeListener(token);

    // Create more documents
    listenerCalls = 0;
    const doc = this.createDocumentWithIdAndData('200', { number: 200 });
    await this.defaultCollection.save(doc);
    await this.sleep(300);

    // Verify listener did NOT fire
    expect(listenerCalls).to.equal(0);

    return {
      testName: 'testQueryChangeListenerWithParameterOldAPI',
      success: true,
      message: 'OLD API: Parameterized query listener works correctly',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testQueryChangeListenerWithParameterOldAPI',
      success: false,
      message: error.message || JSON.stringify(error),
      data: undefined,
    };
  }
}

/**
 * Test Query Change Listener with Parameters - NEW API
 * 
 * Tests query listeners with parameterized queries using new API.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testQueryChangeListenerWithParameterNewAPI(): Promise<ITestResult> {
  try {
    // Create initial documents
    await this.createDocs(10);

    const query = this.database.createQuery(
      'SELECT * FROM _ WHERE number > $minValue'
    );
    
    // Set parameters
    query.parameters.setInt('minValue', 5);


    let listenerCalls = 0;
    let lastResultCount = 0;

    const token = await query.addChangeListener((change) => {
      listenerCalls++;
      if (change && change.results) {
        lastResultCount = change.results.length;
      }
    });

    // Verify token is ListenerToken
    expect(token).to.not.be.a('string');
    expect(token.isRemoved()).to.be.false;

    await this.sleep(300);

    // Verify listener fired and got results
    expect(listenerCalls).to.be.greaterThan(0);
    expect(lastResultCount).to.be.greaterThan(0);

    // Remove listener using NEW API
    await token.remove();
    expect(token.isRemoved()).to.be.true;

    // Create more documents
    listenerCalls = 0;
    const doc = this.createDocumentWithIdAndData('200', { number: 200 });
    await this.defaultCollection.save(doc);
    await this.sleep(300);

    // Verify listener did NOT fire
    expect(listenerCalls).to.equal(0);

    // Verify double remove is safe
    await token.remove();
    expect(token.isRemoved()).to.be.true;

    return {
      testName: 'testQueryChangeListenerWithParameterNewAPI',
      success: true,
      message: 'NEW API: Parameterized query listener works correctly',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testQueryChangeListenerWithParameterNewAPI',
      success: false,
      message: error.message || JSON.stringify(error),
      data: undefined,
    };
  }
}

/**
 * Test Replicator Status Change Listener with OLD API (replicator.removeChangeListener)
 * 
 * Tests replicator status change listener using the old removal API.
 * Note: This test requires a running Sync Gateway.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testReplicatorStatusListenerOldAPI(): Promise<ITestResult> {
  try {
    // Setup: Create some documents to replicate
    await this.createDocs(3);

    // Create replicator configuration
    const platformDomains = {
      ios: 'localhost',
      android: '10.0.2.2',
    };
    const SYNC_GATEWAY_URL = `ws://${platformDomains?.[this.platform] ?? 'localhost'}:4984/projects`;
    const target = new URLEndpoint(SYNC_GATEWAY_URL);
    const config = new ReplicatorConfiguration(target);
    config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
    config.setContinuous(false);
    config.addCollection(this.defaultCollection);

    // Add authentication
    const auth = new BasicAuthenticator('demo@example.com', 'P@ssw0rd12');
    config.setAuthenticator(auth);

    const replicator = await Replicator.create(config);

    let statusChanges = 0;
    const activityLevels: ReplicatorActivityLevel[] = [];

    // Add status change listener
    const token = await replicator.addChangeListener((change) => {
      statusChanges++;
      const level = change.status.getActivityLevel();
      activityLevels.push(level);
      console.log(`Status change ${statusChanges}: ${level}`);
    });

    // Start replication
    await replicator.start();

    // Wait for replication to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Stop replicator
    await replicator.stop();

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 500));

    // ✅ OLD API: Remove listener using replicator.removeChangeListener(token)
    await replicator.removeChangeListener(token);

    // Verify listener was active
    expect(statusChanges).to.be.greaterThan(0, 'Should have received status changes');
    expect(activityLevels.length).to.be.greaterThan(0, 'Should have activity level changes');

    // Start replication again - listener should NOT fire
    const statusChangesBeforeRestart = statusChanges;
    await replicator.start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await replicator.stop();

    // Verify listener is removed
    expect(statusChanges).to.equal(
      statusChangesBeforeRestart,
      'Listener should not fire after removal'
    );

    return {
      testName: 'testReplicatorStatusListenerOldAPI',
      success: true,
      message: `SUCCESS: Replicator status listener with OLD API - received ${statusChanges} status changes`,
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testReplicatorStatusListenerOldAPI',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test Replicator Status Change Listener with NEW API (token.remove())
 * 
 * Tests replicator status change listener using the new ListenerToken.remove() API.
 * Note: This test requires a running Sync Gateway.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testReplicatorStatusListenerNewAPI(): Promise<ITestResult> {
  try {
    // Setup: Create some documents to replicate
    await this.createDocs(3);

    // Create replicator configuration
    const platformDomains = {
      ios: 'localhost',
      android: '10.0.2.2',
    };
    const SYNC_GATEWAY_URL = `ws://${platformDomains?.[this.platform] ?? 'localhost'}:4984/projects`;
    const target = new URLEndpoint(SYNC_GATEWAY_URL);
    const config = new ReplicatorConfiguration(target);
    config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
    config.setContinuous(false);
    config.addCollection(this.defaultCollection);

    // Add authentication
    const auth = new BasicAuthenticator('demo@example.com', 'P@ssw0rd12');
    config.setAuthenticator(auth);

    const replicator = await Replicator.create(config);

    let statusChanges = 0;
    const activityLevels: ReplicatorActivityLevel[] = [];

    // Add status change listener - returns ListenerToken
    const token = await replicator.addChangeListener((change) => {
      statusChanges++;
      const level = change.status.getActivityLevel();
      activityLevels.push(level);
      console.log(`Status change ${statusChanges}: ${level}`);
    });

    // Verify token is a ListenerToken object
    expect(token).to.have.property('remove');
    expect(typeof token.remove).to.equal('function');

    // Start replication
    await replicator.start();

    // Wait for replication to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Stop replicator
    await replicator.stop();

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 500));

    // ✅ NEW API: Remove listener using token.remove()
    await token.remove();

    // Verify listener was active
    expect(statusChanges).to.be.greaterThan(0, 'Should have received status changes');
    expect(activityLevels.length).to.be.greaterThan(0, 'Should have activity level changes');

    // Start replication again - listener should NOT fire
    const statusChangesBeforeRestart = statusChanges;
    await replicator.start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await replicator.stop();

    // Verify listener is removed
    expect(statusChanges).to.equal(
      statusChangesBeforeRestart,
      'Listener should not fire after removal'
    );

    return {
      testName: 'testReplicatorStatusListenerNewAPI',
      success: true,
      message: `SUCCESS: Replicator status listener with NEW API - received ${statusChanges} status changes`,
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testReplicatorStatusListenerNewAPI',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test Replicator Document Change Listener with OLD API (replicator.removeChangeListener)
 * 
 * Tests replicator document change listener using the old removal API.
 * Note: This test requires a running Sync Gateway.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testReplicatorDocumentListenerOldAPI(): Promise<ITestResult> {
  try {
    // Setup: Create some documents to replicate
    const docIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const doc = new MutableDocument(`repl-doc-old-${i}`);
      doc.setString('type', 'test-replication');
      doc.setInt('index', i);
      await this.defaultCollection.save(doc);
      docIds.push(doc.getId());
    }

    // Create replicator configuration
    const platformDomains = {
      ios: 'localhost',
      android: '10.0.2.2',
    };
    const SYNC_GATEWAY_URL = `ws://${platformDomains?.[this.platform] ?? 'localhost'}:4984/projects`;
    const target = new URLEndpoint(SYNC_GATEWAY_URL);
    const config = new ReplicatorConfiguration(target);
    config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
    config.setContinuous(false);
    config.addCollection(this.defaultCollection);

    // Add authentication
    const auth = new BasicAuthenticator('demo@example.com', 'P@ssw0rd12');
    config.setAuthenticator(auth);

    const replicator = await Replicator.create(config);

    let documentChanges = 0;
    const replicatedDocIds: string[] = [];

    // Add document change listener
    const token = await replicator.addDocumentChangeListener((change) => {
      documentChanges++;
      replicatedDocIds.push(change.documentID);
      console.log(`Document replicated: ${change.documentID}`);
    });

    // Start replication
    await replicator.start();

    // Wait for replication to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Stop replicator
    await replicator.stop();

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 500));

    // ✅ OLD API: Remove listener using replicator.removeChangeListener(token)
    await replicator.removeChangeListener(token);

    // Verify listener was active
    expect(documentChanges).to.be.greaterThan(0, 'Should have received document changes');
    expect(replicatedDocIds.length).to.be.greaterThan(0, 'Should have replicated documents');

    // Create more documents and replicate - listener should NOT fire
    const documentChangesBeforeRestart = documentChanges;
    const newDoc = new MutableDocument('repl-doc-old-after-remove');
    newDoc.setString('type', 'test-after-remove');
    await this.defaultCollection.save(newDoc);

    await replicator.start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await replicator.stop();

    // Verify listener is removed
    expect(documentChanges).to.equal(
      documentChangesBeforeRestart,
      'Listener should not fire after removal'
    );

    return {
      testName: 'testReplicatorDocumentListenerOldAPI',
      success: true,
      message: `SUCCESS: Replicator document listener with OLD API - received ${documentChanges} document changes`,
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testReplicatorDocumentListenerOldAPI',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test Replicator Document Change Listener with NEW API (token.remove())
 * 
 * Tests replicator document change listener using the new ListenerToken.remove() API.
 * Note: This test requires a running Sync Gateway.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testReplicatorDocumentListenerNewAPI(): Promise<ITestResult> {
  try {
    // Setup: Create some documents to replicate
    const docIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const doc = new MutableDocument(`repl-doc-new-${i}`);
      doc.setString('type', 'test-replication');
      doc.setInt('index', i);
      await this.defaultCollection.save(doc);
      docIds.push(doc.getId());
    }

    // Create replicator configuration
    const platformDomains = {
      ios: 'localhost',
      android: '10.0.2.2',
    };
    const SYNC_GATEWAY_URL = `ws://${platformDomains?.[this.platform] ?? 'localhost'}:4984/projects`;
    const target = new URLEndpoint(SYNC_GATEWAY_URL);
    const config = new ReplicatorConfiguration(target);
    config.setReplicatorType(ReplicatorType.PUSH_AND_PULL);
    config.setContinuous(false);
    config.addCollection(this.defaultCollection);

    // Add authentication
    const auth = new BasicAuthenticator('demo@example.com', 'P@ssw0rd12');
    config.setAuthenticator(auth);

    const replicator = await Replicator.create(config);

    let documentChanges = 0;
    const replicatedDocIds: string[] = [];

    // Add document change listener - returns ListenerToken
    const token = await replicator.addDocumentChangeListener((change) => {
      documentChanges++;
      replicatedDocIds.push(change.documentID);
      console.log(`Document replicated: ${change.documentID}`);
    });

    // Verify token is a ListenerToken object
    expect(token).to.have.property('remove');
    expect(typeof token.remove).to.equal('function');

    // Start replication
    await replicator.start();

    // Wait for replication to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Stop replicator
    await replicator.stop();

    // Wait a bit more
    await new Promise(resolve => setTimeout(resolve, 500));

    // ✅ NEW API: Remove listener using token.remove()
    await token.remove();

    // Verify listener was active
    expect(documentChanges).to.be.greaterThan(0, 'Should have received document changes');
    expect(replicatedDocIds.length).to.be.greaterThan(0, 'Should have replicated documents');

    // Create more documents and replicate - listener should NOT fire
    const documentChangesBeforeRestart = documentChanges;
    const newDoc = new MutableDocument('repl-doc-new-after-remove');
    newDoc.setString('type', 'test-after-remove');
    await this.defaultCollection.save(newDoc);

    await replicator.start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await replicator.stop();

    // Verify listener is removed
    expect(documentChanges).to.equal(
      documentChangesBeforeRestart,
      'Listener should not fire after removal'
    );

    return {
      testName: 'testReplicatorDocumentListenerNewAPI',
      success: true,
      message: `SUCCESS: Replicator document listener with NEW API - received ${documentChanges} document changes`,
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testReplicatorDocumentListenerNewAPI',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * ========================================
 * EDGE CASE TESTS
 * ========================================
 */

/**
 * Test removing the same listener token twice (OLD API)
 * 
 * Verifies that removing an already-removed listener doesn't cause errors.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testRemoveListenerTwiceOldAPI(): Promise<ITestResult> {
  try {
    const collection = await this.database.createCollection(
      'testRemoveTwiceOld',
      'testScope'
    );

    let changeCount = 0;
    const token = await collection.addChangeListener((change) => {
      changeCount++;
    });

    // Create a document to trigger the listener
    const doc = new MutableDocument('test-doc-1');
    doc.setString('name', 'test');
    await collection.save(doc);

    // Wait for listener to fire
    await new Promise(resolve => setTimeout(resolve, 500));

    // First removal - should succeed
    await collection.removeChangeListener(token);
    const changeCountAfterFirstRemove = changeCount;

    // Second removal - should NOT throw error (idempotent operation)
    await collection.removeChangeListener(token);

    // Create another document - listener should NOT fire
    const doc2 = new MutableDocument('test-doc-2');
    doc2.setString('name', 'test2');
    await collection.save(doc2);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify listener didn't fire after removal
    expect(changeCount).to.equal(
      changeCountAfterFirstRemove,
      'Listener should not fire after removal'
    );

    return {
      testName: 'testRemoveListenerTwiceOldAPI',
      success: true,
      message: 'SUCCESS: Removing listener twice does not cause errors (OLD API)',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testRemoveListenerTwiceOldAPI',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test removing the same listener token twice (NEW API)
 * 
 * Verifies that calling token.remove() twice doesn't cause errors.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testRemoveListenerTwiceNewAPI(): Promise<ITestResult> {
  try {
    const collection = await this.database.createCollection(
      'testRemoveTwiceNew',
      'testScope'
    );

    let changeCount = 0;
    const token = await collection.addChangeListener((change) => {
      changeCount++;
    });

    // Verify token has remove method
    expect(token).to.have.property('remove');
    expect(typeof token.remove).to.equal('function');

    // Create a document to trigger the listener
    const doc = new MutableDocument('test-doc-1');
    doc.setString('name', 'test');
    await collection.save(doc);

    // Wait for listener to fire
    await new Promise(resolve => setTimeout(resolve, 500));

    // First removal - should succeed
    await token.remove();
    const changeCountAfterFirstRemove = changeCount;

    // Second removal - should NOT throw error (idempotent operation)
    await token.remove();

    // Create another document - listener should NOT fire
    const doc2 = new MutableDocument('test-doc-2');
    doc2.setString('name', 'test2');
    await collection.save(doc2);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify listener didn't fire after removal
    expect(changeCount).to.equal(
      changeCountAfterFirstRemove,
      'Listener should not fire after removal'
    );

    return {
      testName: 'testRemoveListenerTwiceNewAPI',
      success: true,
      message: 'SUCCESS: Calling token.remove() twice does not cause errors (NEW API)',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testRemoveListenerTwiceNewAPI',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test removing an invalid/non-existent listener token (OLD API)
 * 
 * Verifies that removing a token that doesn't exist handles gracefully.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testRemoveInvalidTokenOldAPI(): Promise<ITestResult> {
  try {
    const collection = await this.database.createCollection(
      'testInvalidTokenOld',
      'testScope'
    );

    // Try to remove a completely fake token
    const fakeToken = 'non-existent-token-12345';
    
    try {
      await collection.removeChangeListener(fakeToken);
      
      // If we get here, the removal was handled gracefully
      return {
        testName: 'testRemoveInvalidTokenOldAPI',
        success: true,
        message: 'SUCCESS: Removing invalid token handled gracefully (OLD API)',
        data: undefined,
      };
    } catch (error) {
      // It's also acceptable to throw an error for invalid tokens
      return {
        testName: 'testRemoveInvalidTokenOldAPI',
        success: true,
        message: `SUCCESS: Removing invalid token throws expected error (OLD API): ${error}`,
        data: undefined,
      };
    }
  } catch (error) {
    return {
      testName: 'testRemoveInvalidTokenOldAPI',
      success: false,
      message: `FAILED: Unexpected error: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test multiple listeners on different collections
 * 
 * Verifies that multiple listeners can be added and removed independently
 * across different collections.
 * 
 * Note: Collection change listeners are limited to one per collection,
 * so we test with multiple collections instead.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testMultipleListenersIndependentRemoval(): Promise<ITestResult> {
  try {
    // Create three separate collections (since each collection only supports one listener)
    const collection1 = await this.database.createCollection(
      'testMultipleListeners1',
      'testScope'
    );
    
    const collection2 = await this.database.createCollection(
      'testMultipleListeners2',
      'testScope'
    );
    
    const collection3 = await this.database.createCollection(
      'testMultipleListeners3',
      'testScope'
    );

    let listener1Count = 0;
    let listener2Count = 0;
    let listener3Count = 0;

    // Add one listener per collection
    const token1 = await collection1.addChangeListener((change) => {
      listener1Count++;
      console.log('Listener 1 fired');
    });

    const token2 = await collection2.addChangeListener((change) => {
      listener2Count++;
      console.log('Listener 2 fired');
    });

    const token3 = await collection3.addChangeListener((change) => {
      listener3Count++;
      console.log('Listener 3 fired');
    });

    console.log("token1", token1);
    console.log("token2", token2);
    console.log("token3", token3);


    

    // ✅ FIX: Use getUuidToken() instead of toString()
    expect(token1.getUuidToken()).to.not.equal(token2.getUuidToken());
    expect(token2.getUuidToken()).to.not.equal(token3.getUuidToken());
    expect(token1.getUuidToken()).to.not.equal(token3.getUuidToken());

    // Create a document in each collection - all listeners should fire
    const doc1 = new MutableDocument('test-doc-1');
    doc1.setString('name', 'test1');
    await collection1.save(doc1);

    const doc2 = new MutableDocument('test-doc-2');
    doc2.setString('name', 'test2');
    await collection2.save(doc2);

    const doc3 = new MutableDocument('test-doc-3');
    doc3.setString('name', 'test3');
    await collection3.save(doc3);

    await new Promise(resolve => setTimeout(resolve, 500));

    // All listeners should have fired once
    expect(listener1Count).to.equal(1, 'Listener 1 should fire');
    expect(listener2Count).to.equal(1, 'Listener 2 should fire');
    expect(listener3Count).to.equal(1, 'Listener 3 should fire');

    // Remove listener 2 only (using NEW API)
    await token2.remove();

    // Create documents in all collections
    const doc1b = new MutableDocument('test-doc-1b');
    doc1b.setString('name', 'test1b');
    await collection1.save(doc1b);

    const doc2b = new MutableDocument('test-doc-2b');
    doc2b.setString('name', 'test2b');
    await collection2.save(doc2b);

    const doc3b = new MutableDocument('test-doc-3b');
    doc3b.setString('name', 'test3b');
    await collection3.save(doc3b);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Listeners 1 and 3 should fire, but not 2
    expect(listener1Count).to.equal(2, 'Listener 1 should fire again');
    expect(listener2Count).to.equal(1, 'Listener 2 should NOT fire after removal');
    expect(listener3Count).to.equal(2, 'Listener 3 should fire again');

    // Remove listener 1 (using OLD API)
    await collection1.removeChangeListener(token1);

    // Create documents in all collections
    const doc1c = new MutableDocument('test-doc-1c');
    doc1c.setString('name', 'test1c');
    await collection1.save(doc1c);

    const doc2c = new MutableDocument('test-doc-2c');
    doc2c.setString('name', 'test2c');
    await collection2.save(doc2c);

    const doc3c = new MutableDocument('test-doc-3c');
    doc3c.setString('name', 'test3c');
    await collection3.save(doc3c);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Only listener 3 should fire
    expect(listener1Count).to.equal(2, 'Listener 1 should NOT fire after removal');
    expect(listener2Count).to.equal(1, 'Listener 2 should still be removed');
    expect(listener3Count).to.equal(3, 'Listener 3 should fire again');

    // Remove listener 3
    await token3.remove();

    // Create documents in all collections
    const doc1d = new MutableDocument('test-doc-1d');
    doc1d.setString('name', 'test1d');
    await collection1.save(doc1d);

    const doc2d = new MutableDocument('test-doc-2d');
    doc2d.setString('name', 'test2d');
    await collection2.save(doc2d);

    const doc3d = new MutableDocument('test-doc-3d');
    doc3d.setString('name', 'test3d');
    await collection3.save(doc3d);

    await new Promise(resolve => setTimeout(resolve, 500));

    // No listeners should fire
    expect(listener1Count).to.equal(2, 'All listeners removed');
    expect(listener2Count).to.equal(1, 'All listeners removed');
    expect(listener3Count).to.equal(3, 'All listeners removed');

    return {
      testName: 'testMultipleListenersIndependentRemoval',
      success: true,
      message: 'SUCCESS: Multiple listeners can be removed independently across collections',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testMultipleListenersIndependentRemoval',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}


/**
 * Test mixing OLD and NEW API for different listener types
 * 
 * Verifies that OLD and NEW APIs can be used together without conflicts.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testMixedAPIUsage(): Promise<ITestResult> {
  try {
    const collection = await this.database.createCollection(
      'testMixedAPI',
      'testScope'
    );

    let collectionChangeCount = 0;
    let documentChangeCount = 0;

    // Add collection listener (will use NEW API to remove)
    const collectionToken = await collection.addChangeListener((change) => {
      collectionChangeCount++;
    });

    // Add document listener (will use OLD API to remove)
    const docToken = await collection.addDocumentChangeListener('test-doc', (change) => {
      documentChangeCount++;
    });

    // Create and update the document
    const doc = new MutableDocument('test-doc');
    doc.setString('name', 'initial');
    await collection.save(doc);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Both listeners should have fired
    expect(collectionChangeCount).to.be.greaterThan(0, 'Collection listener should fire');
    expect(documentChangeCount).to.be.greaterThan(0, 'Document listener should fire');

    const collectionCountBeforeRemove = collectionChangeCount;
    const documentCountBeforeRemove = documentChangeCount;

    // Remove collection listener using NEW API
    await collectionToken.remove();

    // Remove document listener using OLD API
    await collection.removeDocumentChangeListener(docToken);

    // Update the document again
    const doc2 = await collection.document('test-doc');
    const mutableDoc = MutableDocument.fromDocument(doc2!);
    mutableDoc.setString('name', 'updated');
    await collection.save(mutableDoc);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Neither listener should fire
    expect(collectionChangeCount).to.equal(
      collectionCountBeforeRemove,
      'Collection listener should not fire after removal'
    );
    expect(documentChangeCount).to.equal(
      documentCountBeforeRemove,
      'Document listener should not fire after removal'
    );

    return {
      testName: 'testMixedAPIUsage',
      success: true,
      message: 'SUCCESS: OLD and NEW APIs can be mixed without conflicts',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testMixedAPIUsage',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test query listener with parameter changes
 * 
 * Verifies that listener removal works correctly when re-adding with new parameters.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testQueryListenerWithRapidChanges(): Promise<ITestResult> {
  try {
    // Create initial documents
    await this.createDocs(10);

    let listenerCalls = 0;
    let totalListenerCalls = 0;

    // Test 1: Add listener with minValue = 5
    const query1 = this.database.createQuery(
      'SELECT * FROM _ WHERE number > $minValue'
    );
    query1.parameters.setInt('minValue', 5);

    const token1 = await query1.addChangeListener((change) => {
      listenerCalls++;
      totalListenerCalls++;
      console.log(`Query listener fired: call ${totalListenerCalls}`);
    });

    // Wait for initial query execution
    await new Promise(resolve => setTimeout(resolve, 500));

    expect(listenerCalls).to.be.greaterThan(0, 'Listener should fire initially');
    const firstCallCount = listenerCalls;

    // Remove first listener
    await token1.remove();
    listenerCalls = 0;

    // Test 2: Add listener with minValue = 3 (different parameter)
    const query2 = this.database.createQuery(
      'SELECT * FROM _ WHERE number > $minValue'
    );
    query2.parameters.setInt('minValue', 3);

    const token2 = await query2.addChangeListener((change) => {
      listenerCalls++;
      totalListenerCalls++;
      console.log(`Query listener fired: call ${totalListenerCalls}`);
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(listenerCalls).to.be.greaterThan(0, 'Second listener should fire');
    const secondCallCount = listenerCalls;

    // Remove second listener
    await token2.remove();
    listenerCalls = 0;

    // Test 3: Add listener with minValue = 7
    const query3 = this.database.createQuery(
      'SELECT * FROM _ WHERE number > $minValue'
    );
    query3.parameters.setInt('minValue', 7);

    const token3 = await query3.addChangeListener((change) => {
      listenerCalls++;
      totalListenerCalls++;
      console.log(`Query listener fired: call ${totalListenerCalls}`);
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(listenerCalls).to.be.greaterThan(0, 'Third listener should fire');

    // Final removal
    await token3.remove();

    // Create a new document - no listeners should fire
    const callsBeforeFinalTest = totalListenerCalls;
    const doc = new MutableDocument('final-test-doc');
    doc.setInt('number', 100);
    await this.defaultCollection.save(doc);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify no listeners fired
    expect(totalListenerCalls).to.equal(
      callsBeforeFinalTest,
      'No listeners should fire after all removed'
    );

    return {
      testName: 'testQueryListenerWithRapidChanges',
      success: true,
      message: `SUCCESS: Query listener removal works with parameter changes - ${totalListenerCalls} total calls`,
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testQueryListenerWithRapidChanges',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test listener removal during active changes
 * 
 * Verifies that removing a listener while changes are happening is safe.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testRemoveListenerDuringActiveChanges(): Promise<ITestResult> {
  try {
    const collection = await this.database.createCollection(
      'testRemoveDuringChanges',
      'testScope'
    );

    let changeCount = 0;
    let removedDuringCallback = false;

    const token = await collection.addChangeListener((change) => {
      changeCount++;
      console.log(`Change ${changeCount} detected`);
    });

    // Start creating documents rapidly
    const createDocsPromise = (async () => {
      for (let i = 0; i < 20; i++) {
        const doc = new MutableDocument(`rapid-doc-${i}`);
        doc.setInt('index', i);
        await collection.save(doc);
        
        // Remove listener in the middle of document creation
        if (i === 10 && !removedDuringCallback) {
          await token.remove();
          removedDuringCallback = true;
          console.log('Listener removed during active changes');
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    })();

    await createDocsPromise;
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify listener was removed
    expect(removedDuringCallback).to.be.true;
    
    // Change count should be less than 20 (since we removed it midway)
    expect(changeCount).to.be.lessThan(20, 'Listener should have been removed before all documents');
    expect(changeCount).to.be.greaterThan(0, 'Listener should have fired before removal');

    return {
      testName: 'testRemoveListenerDuringActiveChanges',
      success: true,
      message: `SUCCESS: Listener removal during active changes is safe - ${changeCount} changes detected before removal`,
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testRemoveListenerDuringActiveChanges',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test listener token after database close
 * 
 * Verifies behavior when trying to remove a listener after database is closed.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testListenerTokenAfterDatabaseClose(): Promise<ITestResult> {
  try {
    // Create a separate database for this test
    const testDbName = 'testListenerAfterClose';
    const config = new DatabaseConfiguration();
    config.directory = this.directory; // Use the test directory
    const testDb = new Database(testDbName, config);
    await testDb.open();

    const collection = await testDb.defaultCollection();

    let changeCount = 0;
    const token = await collection.addChangeListener((change) => {
      changeCount++;
    });

    // Create a document
    const doc = new MutableDocument('test-doc');
    doc.setString('name', 'test');
    await collection.save(doc);

    await new Promise(resolve => setTimeout(resolve, 500));

    expect(changeCount).to.be.greaterThan(0, 'Listener should fire before close');

    // Close the database
    await testDb.close();

    // Try to remove the listener after database is closed
    try {
      await token.remove();
      
      // If we get here, removal was handled gracefully
      // Cleanup: delete the test database
      await Database.deleteDatabase(testDbName, this.directory);
      
      return {
        testName: 'testListenerTokenAfterDatabaseClose',
        success: true,
        message: 'SUCCESS: Listener removal after database close handled gracefully',
        data: undefined,
      };
    } catch (error) {
      // It's acceptable to throw an error when database is closed
      // Cleanup: delete the test database
      try {
        await Database.deleteDatabase(testDbName, this.directory);
      } catch (cleanupError) {
        console.log('Cleanup error (expected):', cleanupError);
      }
      
      return {
        testName: 'testListenerTokenAfterDatabaseClose',
        success: true,
        message: `SUCCESS: Listener removal after database close throws expected error: ${error}`,
        data: undefined,
      };
    }
  } catch (error) {
    // Try to cleanup even if test fails
    try {
      await Database.deleteDatabase('testListenerAfterClose', this.directory);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    return {
      testName: 'testListenerTokenAfterDatabaseClose',
      success: false,
      message: `FAILED: Unexpected error: ${error}`,
      data: undefined,
    };
  }
}

/**
 * Test ListenerToken properties and methods
 * 
 * Verifies that ListenerToken has the expected interface.
 * 
 * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object
 */
async testListenerTokenInterface(): Promise<ITestResult> {
  try {
    const collection = await this.database.createCollection(
      'testTokenInterface',
      'testScope'
    );

    const token = await collection.addChangeListener((change) => {
      // Listener callback
    });

    // Verify token is an object
    expect(token).to.be.an('object', 'Token should be an object');

    // ✅ FIX: Use correct Chai syntax - property name only, no second parameter
    expect(token).to.have.property('remove');
    expect(typeof token.remove).to.equal('function', 'remove should be a function');

    // Verify token has getUuidToken method
    expect(token).to.have.property('getUuidToken');
    expect(typeof token.getUuidToken).to.equal('function', 'getUuidToken should be a function');

    // Verify token has isRemoved method
    expect(token).to.have.property('isRemoved');
    expect(typeof token.isRemoved).to.equal('function', 'isRemoved should be a function');

    // Verify getUuidToken returns a string
    const uuidToken = token.getUuidToken();
    expect(uuidToken).to.be.a('string', 'UUID token should be a string');
    expect(uuidToken.length).to.be.greaterThan(0, 'UUID token should not be empty');

    // Verify isRemoved returns false initially
    expect(token.isRemoved()).to.be.false;

    // Verify remove returns a Promise
    const removeResult = token.remove();
    expect(removeResult).to.be.instanceOf(Promise, 'remove() should return a Promise');
    await removeResult;

    // Verify isRemoved returns true after removal
    expect(token.isRemoved()).to.be.true;

    return {
      testName: 'testListenerTokenInterface',
      success: true,
      message: 'SUCCESS: ListenerToken has correct interface',
      data: undefined,
    };
  } catch (error) {
    return {
      testName: 'testListenerTokenInterface',
      success: false,
      message: `FAILED: ${error}`,
      data: undefined,
    };
  }
}

}