import { TestCase } from './test-case';
import { ITestResult } from './test-result.types';
/**
 * ReplicatorTests - reminder all test cases must start with 'test' in the name of the method or they will not run
 * */
export declare class ReplicatorTests extends TestCase {
    constructor();
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testReplicatorConfigDefaultValues(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testEmptyPush(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testStartWithCheckpoint(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testStartWithResetCheckpointContinuous(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testDocumentReplicationEvent(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testRemoveDocumentReplicationListener(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testDocumentReplicationEventWithPushConflict(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testDocumentReplicationEventWithPullConflict(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testDocumentReplicationEventWithDeletion(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testSingleShotPushFilter(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testContinuousPushFilter(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testPullFilter(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testPushAndForget(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testPullRemovedDocWithFilterSingleShot(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testPullRemovedDocWithFilterContinuous(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testStopAndRestartPushReplicationWithFilter(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testStopAndRestartPullReplicationWithFilter(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testRemoveChangeListener(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testAddRemoveChangeListenerAfterReplicatorStart(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testCopyingReplicatorConfiguration(): Promise<ITestResult>;
    /**
     *
     * @returns {Promise<ITestResult>} A promise that resolves to an ITestResult object which contains the result of the verification.
     */
    testReplicationConfigSetterMethods(): Promise<ITestResult>;
}
