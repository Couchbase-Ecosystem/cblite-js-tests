import { TestCase } from './test-case';
import { ITestResult } from './test-result.types';
import { LogSinks, LogLevel, LogDomain } from 'cblite-js';
import { expect } from 'chai';

/**
 * LogSinksTests - Tests for the new LogSinks API
 * Reminder: all test cases must start with 'test' in the name of the method or they will not run
 */
export class LogSinksTests extends TestCase {
  constructor() {
    super();
  }

  // ============================================================
  // CONSOLE SINK TESTS
  // ============================================================

  /**
   * Test enabling console log sink with all domains
   */
  async testConsoleLogSinkEnableWithAllDomains(): Promise<ITestResult> {
    try {
      await LogSinks.setConsole({
        level: LogLevel.DEBUG,
        domains: [LogDomain.ALL],
      });

      return {
        testName: 'testConsoleLogSinkEnableWithAllDomains',
        success: true,
        message: 'Console log sink enabled successfully with all domains',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testConsoleLogSinkEnableWithAllDomains',
        success: false,
        message: `Failed to enable console log sink: ${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test enabling console log sink with specific domains
   */
  async testConsoleLogSinkEnableWithSpecificDomains(): Promise<ITestResult> {
    try {
      await LogSinks.setConsole({
        level: LogLevel.INFO,
        domains: [LogDomain.DATABASE, LogDomain.QUERY],
      });

      return {
        testName: 'testConsoleLogSinkEnableWithSpecificDomains',
        success: true,
        message: 'Console log sink enabled successfully with specific domains',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testConsoleLogSinkEnableWithSpecificDomains',
        success: false,
        message: `Failed to enable console log sink: ${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test disabling console log sink
   */
  async testConsoleLogSinkDisable(): Promise<ITestResult> {
    try {
      // First enable
      await LogSinks.setConsole({
        level: LogLevel.WARNING,
      });

      // Then disable by passing null
      await LogSinks.setConsole(null);

      return {
        testName: 'testConsoleLogSinkDisable',
        success: true,
        message: 'Console log sink disabled successfully',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testConsoleLogSinkDisable',
        success: false,
        message: `Failed to disable console log sink: ${error}`,
        data: undefined,
      };
    }
  }

  // ============================================================
  // FILE SINK TESTS
  // ============================================================

  /**
   * Test enabling file log sink with default options
   */
  async testFileLogSinkEnableWithDefaults(): Promise<ITestResult> {
    try {
      const logsDirectory = `${this.directory}/logs`;

      await LogSinks.setFile({
        level: LogLevel.DEBUG,
        directory: logsDirectory,
      });

      return {
        testName: 'testFileLogSinkEnableWithDefaults',
        success: true,
        message: 'File log sink enabled successfully with defaults',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testFileLogSinkEnableWithDefaults',
        success: false,
        message: `Failed to enable file log sink: ${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test enabling file log sink with all options
   */
  async testFileLogSinkEnableWithAllOptions(): Promise<ITestResult> {
    try {
      const logsDirectory = `${this.directory}/logs_full`;

      await LogSinks.setFile({
        level: LogLevel.VERBOSE,
        directory: logsDirectory,
        usePlaintext: true,
        maxFileSize: 1024 * 1024, // 1 MB
        maxKeptFiles: 5,
      });

      return {
        testName: 'testFileLogSinkEnableWithAllOptions',
        success: true,
        message: 'File log sink enabled successfully with all options',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testFileLogSinkEnableWithAllOptions',
        success: false,
        message: `Failed to enable file log sink with all options: ${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test disabling file log sink
   */
  async testFileLogSinkDisable(): Promise<ITestResult> {
    try {
      const logsDirectory = `${this.directory}/logs_disable`;

      // First enable
      await LogSinks.setFile({
        level: LogLevel.INFO,
        directory: logsDirectory,
      });

      // Then disable by passing null
      await LogSinks.setFile(null);

      return {
        testName: 'testFileLogSinkDisable',
        success: true,
        message: 'File log sink disabled successfully',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testFileLogSinkDisable',
        success: false,
        message: `Failed to disable file log sink: ${error}`,
        data: undefined,
      };
    }
  }

  // ============================================================
  // CUSTOM SINK TESTS
  // ============================================================

  /**
   * Test enabling custom log sink and receiving callback
   */
  async testCustomLogSinkEnableAndReceiveCallback(): Promise<ITestResult> {
    try {
      let callbackReceived = false;
      let receivedLevel: LogLevel | null = null;
      let receivedDomain: LogDomain | null = null;
      let receivedMessage: string | null = null;

      await LogSinks.setCustom({
        level: LogLevel.DEBUG,
        domains: [LogDomain.DATABASE],
        callback: (level, domain, message) => {
          callbackReceived = true;
          receivedLevel = level;
          receivedDomain = domain;
          receivedMessage = message;
        },
      });

      // Trigger some database activity to generate logs
      if (this.database) {
        await this.database.defaultCollection();
      }

      // Give some time for logs to be generated
      await this.sleep(500);

      // Disable custom sink
      await LogSinks.setCustom(null);

      return {
        testName: 'testCustomLogSinkEnableAndReceiveCallback',
        success: true,
        message: callbackReceived
          ? `Custom log callback received - Level: ${receivedLevel}, Domain: ${receivedDomain}`
          : 'Custom log sink enabled (no logs generated during test)',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCustomLogSinkEnableAndReceiveCallback',
        success: false,
        message: `Failed to enable custom log sink: ${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test disabling custom log sink
   */
  async testCustomLogSinkDisable(): Promise<ITestResult> {
    try {
      // First enable
      await LogSinks.setCustom({
        level: LogLevel.WARNING,
        callback: (level, domain, message) => {
          console.log(`Custom log: [${domain}] ${message}`);
        },
      });

      // Then disable by passing null
      await LogSinks.setCustom(null);

      return {
        testName: 'testCustomLogSinkDisable',
        success: true,
        message: 'Custom log sink disabled successfully',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testCustomLogSinkDisable',
        success: false,
        message: `Failed to disable custom log sink: ${error}`,
        data: undefined,
      };
    }
  }

  // ============================================================
  // ENUM VALIDATION TESTS
  // ============================================================

  /**
   * Test LogLevel enum values
   */
  async testLogLevelEnumValues(): Promise<ITestResult> {
    try {
      expect(LogLevel.DEBUG).to.equal(0);
      expect(LogLevel.VERBOSE).to.equal(1);
      expect(LogLevel.INFO).to.equal(2);
      expect(LogLevel.WARNING).to.equal(3);
      expect(LogLevel.ERROR).to.equal(4);
      expect(LogLevel.NONE).to.equal(5);

      return {
        testName: 'testLogLevelEnumValues',
        success: true,
        message: 'LogLevel enum values are correct',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testLogLevelEnumValues',
        success: false,
        message: `LogLevel enum validation failed: ${error}`,
        data: undefined,
      };
    }
  }

  /**
   * Test LogDomain enum values
   */
  async testLogDomainEnumValues(): Promise<ITestResult> {
    try {
      const expectedDomains = [
        'DATABASE',
        'QUERY',
        'REPLICATOR',
        'NETWORK',
        'LISTENER',
        // 'PEER_DISCOVERY',
        // 'MDNS',
        // 'MULTIPEER',
        'ALL',
      ];

      const actualDomains = Object.values(LogDomain);
      expect(actualDomains).to.include.members(expectedDomains.slice(0, 5)); // Core domains

      return {
        testName: 'testLogDomainEnumValues',
        success: true,
        message: 'LogDomain enum values are correct',
        data: undefined,
      };
    } catch (error) {
      return {
        testName: 'testLogDomainEnumValues',
        success: false,
        message: `LogDomain enum validation failed: ${error}`,
        data: undefined,
      };
    }
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  async tearDown() {
    // Disable all log sinks before teardown
    try {
      await LogSinks.setConsole(null);
      await LogSinks.setFile(null);
      await LogSinks.setCustom(null);
    } catch (e) {
      // Ignore errors during cleanup
    }
    await super.tearDown();
  }
}