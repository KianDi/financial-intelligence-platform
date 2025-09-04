const { WebSocketIntegrationTestSuite } = require('./test-websocket-integration');

// Main WebSocket Test Runner - Unified entry point for all WebSocket testing
class WebSocketTestRunner {
  constructor() {
    this.availableTests = {
      'basic': {
        description: 'Basic WebSocket connection and messaging tests',
        file: 'test-websocket-flow.js',
        quick: true
      },
      'comprehensive': {
        description: 'Complete WebSocket functionality test suite',
        file: 'test-websocket-comprehensive.js',
        quick: false
      },
      'resilience': {
        description: 'Error handling and reconnection tests',
        file: 'test-websocket-resilience.js',
        quick: false
      },
      'heartbeat': {
        description: 'Heartbeat and health monitoring tests',
        file: 'test-websocket-heartbeat.js',
        quick: false
      },
      'integration': {
        description: 'Integrated test suite (runs all tests)',
        file: 'test-websocket-integration.js',
        quick: false
      }
    };
  }

  displayHelp() {
    console.log('🔌 WebSocket Test Suite - Available Tests');
    console.log('='.repeat(60));
    console.log('');
    console.log('Usage: node test-websocket-suite.js [ACCESS_TOKEN] [TEST_TYPE]');
    console.log('');
    console.log('Available Test Types:');
    console.log('');
    
    Object.entries(this.availableTests).forEach(([key, test]) => {
      const speed = test.quick ? '[QUICK]' : '[FULL] ';
      console.log(`  ${key.padEnd(12)} ${speed} ${test.description}`);
    });
    
    console.log('');
    console.log('Special Commands:');
    console.log('  all          [FULL]  Run all tests sequentially');
    console.log('  quick        [QUICK] Run essential tests only');
    console.log('  ci           [QUICK] CI-friendly quick tests with exit codes');
    console.log('');
    console.log('Examples:');
    console.log('  node test-websocket-suite.js [TOKEN] basic');
    console.log('  node test-websocket-suite.js [TOKEN] integration');
    console.log('  node test-websocket-suite.js [TOKEN] all');
    console.log('  node test-websocket-suite.js [TOKEN] quick');
    console.log('');
    console.log('Get access token by running: node test-auth.js');
  }

  async runSpecificTest(testType, accessToken) {
    if (!this.availableTests[testType]) {
      console.log(`❌ Unknown test type: ${testType}`);
      this.displayHelp();
      return false;
    }

    const test = this.availableTests[testType];
    console.log(`🚀 Running ${testType} WebSocket tests...`);
    console.log(`📝 ${test.description}`);
    console.log('-'.repeat(60));

    try {
      if (testType === 'integration') {
        const integrationSuite = new WebSocketIntegrationTestSuite(accessToken);
        const results = await integrationSuite.runFullTests();
        return results.allSuitesPassed;
      } else {
        // Dynamic import and run individual test
        const testModule = require(`./${test.file}`);
        
        if (testType === 'basic') {
          // test-websocket-flow.js has different structure
          const { exec } = require('child_process');
          return new Promise((resolve) => {
            const child = exec(`node ${test.file} ${accessToken}`, (error, stdout, stderr) => {
              console.log(stdout);
              if (stderr) console.error(stderr);
              resolve(!error);
            });
          });
        } else {
          // Other tests follow the TestSuite pattern
          const TestSuiteClass = Object.values(testModule).find(exp => 
            typeof exp === 'function' && exp.name && exp.name.includes('TestSuite')
          );
          
          if (TestSuiteClass) {
            const testSuite = new TestSuiteClass(accessToken);
            return await testSuite.runAllTests();
          } else {
            console.log(`❌ Could not find test suite class in ${test.file}`);
            return false;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error running ${testType} tests:`, error.message);
      return false;
    }
  }

  async runAllTests(accessToken) {
    console.log('🔄 Running ALL WebSocket Tests');
    console.log('='.repeat(60));
    
    const results = {};
    const testOrder = ['basic', 'comprehensive', 'resilience', 'heartbeat'];
    
    for (const testType of testOrder) {
      console.log(`\n🎯 Starting ${testType} tests...`);
      const passed = await this.runSpecificTest(testType, accessToken);
      results[testType] = passed;
      
      if (passed) {
        console.log(`✅ ${testType} tests PASSED`);
      } else {
        console.log(`❌ ${testType} tests FAILED`);
      }
    }

    // Generate summary report
    console.log('\n' + '='.repeat(60));
    console.log('📊 ALL TESTS SUMMARY REPORT');
    console.log('='.repeat(60));
    
    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(Boolean).length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Test Suites: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    
    console.log('\nDetailed Results:');
    Object.entries(results).forEach(([testType, passed]) => {
      const status = passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${testType.padEnd(12)} ${status}`);
    });
    
    const allPassed = passedTests === totalTests;
    console.log('\n' + '='.repeat(60));
    console.log(allPassed ? '✅ ALL WEBSOCKET TESTS PASSED' : '❌ SOME WEBSOCKET TESTS FAILED');
    console.log('='.repeat(60));
    
    return allPassed;
  }

  async runQuickTests(accessToken) {
    console.log('⚡ Running Quick WebSocket Tests (Essential Only)');
    console.log('='.repeat(60));
    
    const integrationSuite = new WebSocketIntegrationTestSuite(accessToken);
    const results = await integrationSuite.runQuickTests();
    return results.allSuitesPassed;
  }

  async runCITests(accessToken) {
    console.log('🤖 Running CI WebSocket Tests');
    console.log('='.repeat(60));
    
    // CI-specific test run with proper exit codes and minimal output
    const integrationSuite = new WebSocketIntegrationTestSuite(accessToken);
    const results = await integrationSuite.runQuickTests();
    
    if (results.allSuitesPassed) {
      console.log('✅ CI WebSocket tests PASSED');
      return true;
    } else {
      console.log('❌ CI WebSocket tests FAILED');
      console.log(`Failed Tests: ${results.failedTests}/${results.totalTests}`);
      return false;
    }
  }
}

// Main execution
async function main() {
  const accessToken = process.argv[2];
  const testType = process.argv[3] || 'help';

  const runner = new WebSocketTestRunner();

  if (!accessToken || testType === 'help') {
    runner.displayHelp();
    process.exit(testType === 'help' ? 0 : 1);
  }

  try {
    let success = false;

    switch (testType) {
      case 'all':
        success = await runner.runAllTests(accessToken);
        break;
      case 'quick':
        success = await runner.runQuickTests(accessToken);
        break;
      case 'ci':
        success = await runner.runCITests(accessToken);
        break;
      default:
        success = await runner.runSpecificTest(testType, accessToken);
        break;
    }

    process.exit(success ? 0 : 1);

  } catch (error) {
    console.error('❌ WebSocket test suite execution failed:', error.message);
    process.exit(1);
  }
}

// Export for module usage
module.exports = {
  WebSocketTestRunner
};

// Run if called directly
if (require.main === module) {
  main();
}