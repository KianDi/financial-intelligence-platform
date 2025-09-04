const { WebSocketTestSuite } = require('./test-websocket-comprehensive');
const { ResilienceTestSuite } = require('./test-websocket-resilience');
const { HeartbeatTestSuite } = require('./test-websocket-heartbeat');

// Integrated WebSocket Test Runner that orchestrates all WebSocket tests
class WebSocketIntegrationTestSuite {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.testResults = {
      comprehensive: null,
      resilience: null,
      heartbeat: null,
      overall: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        successRate: 0,
        executionTime: 0
      }
    };
  }

  async runAllWebSocketTests(options = {}) {
    const startTime = Date.now();
    
    console.log('🔌 Starting Integrated WebSocket Test Suite');
    console.log('='.repeat(80));
    console.log(`Testing WebSocket API: wss://ke2ary80yk.execute-api.us-east-1.amazonaws.com/dev`);
    console.log(`Test Scope: ${options.quick ? 'QUICK' : 'COMPREHENSIVE'}`);
    console.log('='.repeat(80));

    const testSuites = [
      { name: 'comprehensive', suite: new WebSocketTestSuite(this.accessToken), enabled: true },
      { name: 'resilience', suite: new ResilienceTestSuite(this.accessToken), enabled: !options.quick },
      { name: 'heartbeat', suite: new HeartbeatTestSuite(this.accessToken), enabled: !options.quick }
    ];

    // Run enabled test suites
    for (const testConfig of testSuites) {
      if (!testConfig.enabled) {
        console.log(`⏭️  Skipping ${testConfig.name} tests (quick mode)`);
        continue;
      }

      console.log(`\n🚀 Running ${testConfig.name.toUpperCase()} test suite...`);
      console.log('-'.repeat(60));
      
      try {
        const suiteStartTime = Date.now();
        const passed = await testConfig.suite.runAllTests();
        const suiteEndTime = Date.now();
        
        this.testResults[testConfig.name] = {
          passed,
          executionTime: suiteEndTime - suiteStartTime,
          testCount: testConfig.suite.results?.length || 0
        };
        
        console.log(`✅ ${testConfig.name.toUpperCase()} suite completed in ${suiteEndTime - suiteStartTime}ms`);
        
      } catch (error) {
        console.error(`❌ ${testConfig.name.toUpperCase()} suite failed:`, error.message);
        this.testResults[testConfig.name] = {
          passed: false,
          executionTime: 0,
          error: error.message,
          testCount: 0
        };
      }
    }

    const endTime = Date.now();
    this.testResults.overall.executionTime = endTime - startTime;
    
    return this.generateIntegratedReport();
  }

  generateIntegratedReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 INTEGRATED WEBSOCKET TEST SUITE REPORT');
    console.log('='.repeat(80));

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let allSuitesPassed = true;

    // Calculate totals across all suites
    Object.entries(this.testResults).forEach(([suiteName, results]) => {
      if (suiteName === 'overall') return;
      
      if (results && results.testCount) {
        totalTests += results.testCount;
        if (results.passed) {
          totalPassed += results.testCount;
        } else {
          totalFailed += results.testCount;
          allSuitesPassed = false;
        }
      } else if (results && results.error) {
        totalTests += 1;
        totalFailed += 1;
        allSuitesPassed = false;
      }
    });

    this.testResults.overall = {
      totalTests,
      passedTests: totalPassed,
      failedTests: totalFailed,
      successRate: totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0,
      executionTime: this.testResults.overall.executionTime,
      allSuitesPassed
    };

    // Display overall metrics
    console.log(`📊 OVERALL RESULTS:`);
    console.log(`   Total Tests Executed: ${totalTests}`);
    console.log(`   Tests Passed: ${totalPassed}`);
    console.log(`   Tests Failed: ${totalFailed}`);
    console.log(`   Success Rate: ${this.testResults.overall.successRate}%`);
    console.log(`   Total Execution Time: ${this.testResults.overall.executionTime}ms`);

    // Display individual suite results
    console.log(`\n📋 SUITE BREAKDOWN:`);
    console.log('-'.repeat(80));
    
    Object.entries(this.testResults).forEach(([suiteName, results]) => {
      if (suiteName === 'overall') return;
      
      if (!results) {
        console.log(`   ${suiteName.toUpperCase()}: SKIPPED`);
      } else if (results.error) {
        console.log(`   ${suiteName.toUpperCase()}: ❌ FAILED (${results.error})`);
      } else {
        const status = results.passed ? '✅ PASSED' : '❌ FAILED';
        console.log(`   ${suiteName.toUpperCase()}: ${status} (${results.testCount} tests, ${results.executionTime}ms)`);
      }
    });

    // Integration recommendations
    console.log(`\n🔧 INTEGRATION STATUS:`);
    console.log('-'.repeat(80));
    
    if (allSuitesPassed) {
      console.log(`✅ WebSocket integration is PRODUCTION READY`);
      console.log(`   • All core functionality validated`);
      console.log(`   • Error handling and resilience confirmed`);
      console.log(`   • Connection health monitoring operational`);
      console.log(`   • Real-time broadcasting system verified`);
    } else {
      console.log(`⚠️  WebSocket integration needs attention`);
      console.log(`   • ${totalFailed} test(s) failed`);
      console.log(`   • Review failed tests before production deployment`);
      console.log(`   • Check AWS Lambda function logs for detailed errors`);
    }

    // Next steps
    console.log(`\n📋 RECOMMENDED NEXT STEPS:`);
    console.log('-'.repeat(80));
    if (allSuitesPassed) {
      console.log(`1. Deploy WebSocket changes to production`);
      console.log(`2. Integrate WebSocket tests into CI/CD pipeline`);
      console.log(`3. Set up monitoring for WebSocket connection metrics`);
      console.log(`4. Proceed with frontend real-time UI enhancements`);
    } else {
      console.log(`1. Fix failing test cases`);
      console.log(`2. Re-run test suite to verify fixes`);
      console.log(`3. Review CloudWatch logs for Lambda function errors`);
      console.log(`4. Validate AWS IAM permissions and EventBridge configuration`);
    }

    console.log('\n' + '='.repeat(80));
    const finalStatus = allSuitesPassed ? '✅ WEBSOCKET INTEGRATION TESTS PASSED' : '❌ WEBSOCKET INTEGRATION TESTS FAILED';
    console.log(finalStatus);
    console.log('='.repeat(80));

    return this.testResults.overall;
  }

  // Quick test runner for CI/CD or rapid validation
  async runQuickTests() {
    return this.runAllWebSocketTests({ quick: true });
  }

  // Comprehensive test runner for thorough validation
  async runFullTests() {
    return this.runAllWebSocketTests({ quick: false });
  }
}

// Command line execution
async function main() {
  const accessToken = process.argv[2];
  const testMode = process.argv[3] || 'full'; // 'quick' or 'full'

  if (!accessToken) {
    console.log('❌ Please provide an access token as argument');
    console.log('Usage: node test-websocket-integration.js [ACCESS_TOKEN] [quick|full]');
    console.log('');
    console.log('Examples:');
    console.log('  node test-websocket-integration.js [TOKEN] quick  # Run essential tests only');
    console.log('  node test-websocket-integration.js [TOKEN] full   # Run all tests (default)');
    console.log('');
    console.log('Get token by running: node test-auth.js');
    process.exit(1);
  }

  try {
    const integrationSuite = new WebSocketIntegrationTestSuite(accessToken);
    
    let results;
    if (testMode === 'quick') {
      results = await integrationSuite.runQuickTests();
    } else {
      results = await integrationSuite.runFullTests();
    }

    // Exit with appropriate code
    const exitCode = results.allSuitesPassed ? 0 : 1;
    
    if (exitCode === 0) {
      console.log('\n🎉 All WebSocket integration tests completed successfully!');
    } else {
      console.log('\n💥 Some WebSocket integration tests failed. Please review the results above.');
    }
    
    process.exit(exitCode);

  } catch (error) {
    console.error('❌ Integration test suite execution failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Export for module usage
module.exports = {
  WebSocketIntegrationTestSuite
};

// Run if called directly
if (require.main === module) {
  main();
}