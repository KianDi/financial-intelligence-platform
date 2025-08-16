const axios = require('axios');

const API_BASE_URL = 'https://4we9e1egsg.execute-api.us-east-1.amazonaws.com';

// Test Phase 1 - Transaction and User Management APIs
async function testPhase1APIs(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  console.log('Testing Phase 1 - Transaction & User Management APIs\n');

  try {
    // Test 1: Create User Profile
    console.log('1. Testing POST /users (Create User Profile)');
    const userProfile = {
      firstName: 'John',
      lastName: 'Doe',
      preferences: {
        currency: 'USD',
        budgetAlerts: true,
        weeklyReports: false,
      },
      timezone: 'America/New_York',
    };

    const createUserResponse = await axios.post(
      `${API_BASE_URL}/users`,
      userProfile,
      { headers }
    );
    console.log('SUCCESS: User Profile Created:', {
      fullName: createUserResponse.data.profile.fullName,
      profileCompleted: createUserResponse.data.profile.profileCompleted,
    });

    // Test 2: Get User Profile
    console.log('\n2. Testing GET /users/profile (Get User Profile)');
    const getUserResponse = await axios.get(`${API_BASE_URL}/users/profile`, {
      headers,
    });
    console.log('SUCCESS: User Profile Retrieved:', {
      displayName: getUserResponse.data.profile.displayName,
      memberSince: getUserResponse.data.profile.memberSince.substr(0, 10),
    });

    // Test 3: Create Income Transaction
    console.log('\n3. Testing POST /transactions (Create Income Transaction)');
    const incomeTransaction = {
      amount: 3000.0,
      category: 'salary',
      description: 'Monthly salary deposit',
      type: 'income',
    };

    const createIncomeResponse = await axios.post(
      `${API_BASE_URL}/transactions`,
      incomeTransaction,
      { headers }
    );
    console.log('SUCCESS: Income Transaction Created:', {
      transactionId: createIncomeResponse.data.transaction.transactionId,
      amount: createIncomeResponse.data.transaction.amount,
      type: createIncomeResponse.data.transaction.type,
    });

    // Test 4: Create Expense Transactions
    console.log(
      '\n4. Testing POST /transactions (Create Expense Transactions)'
    );
    const expenseTransactions = [
      {
        amount: 1200.0,
        category: 'housing',
        description: 'Monthly rent',
        type: 'expense',
      },
      {
        amount: 350.0,
        category: 'food',
        description: 'Grocery shopping',
        type: 'expense',
      },
      {
        amount: 75.5,
        category: 'transportation',
        description: 'Gas for car',
        type: 'expense',
      },
    ];

    const createdExpenses = [];
    for (const expense of expenseTransactions) {
      const response = await axios.post(
        `${API_BASE_URL}/transactions`,
        expense,
        { headers }
      );
      createdExpenses.push(response.data.transaction);
      console.log(`   • Created ${expense.category}: $${expense.amount}`);
    }

    // Test 5: Get All Transactions
    console.log('\n5. Testing GET /transactions (Get All Transactions)');
    const getAllResponse = await axios.get(`${API_BASE_URL}/transactions`, {
      headers,
    });
    console.log('SUCCESS: All Transactions Retrieved:', {
      totalTransactions: getAllResponse.data.summary.totalTransactions,
      totalIncome: getAllResponse.data.summary.totalIncome,
      totalExpenses: getAllResponse.data.summary.totalExpenses,
      netAmount: getAllResponse.data.summary.netAmount,
    });

    // Test 6: Get Transactions by Category
    console.log(
      '\n6. Testing GET /transactions?category=food (Filter by Category)'
    );
    const categoryResponse = await axios.get(
      `${API_BASE_URL}/transactions?category=food`,
      { headers }
    );
    console.log('SUCCESS: Food Transactions:', {
      count: categoryResponse.data.transactions.length,
      totalAmount: categoryResponse.data.summary.totalExpenses,
    });

    // Test 7: Get Expense Transactions Only
    console.log('\n7. Testing GET /transactions?type=expense (Filter by Type)');
    const expenseResponse = await axios.get(
      `${API_BASE_URL}/transactions?type=expense`,
      { headers }
    );
    console.log('SUCCESS: Expense Transactions:', {
      count: expenseResponse.data.transactions.length,
      totalAmount: expenseResponse.data.summary.totalExpenses,
    });

    // Test 8: Update a Transaction
    console.log(
      '\n8. Testing PUT /transactions/{timestamp} (Update Transaction)'
    );
    const firstTransaction = getAllResponse.data.transactions[0];
    const updateData = {
      amount: firstTransaction.amount + 50,
      description: `${firstTransaction.description} - Updated`,
    };

    const updateResponse = await axios.put(
      `${API_BASE_URL}/transactions/${firstTransaction.timestamp}`,
      updateData,
      { headers }
    );
    console.log('SUCCESS: Transaction Updated:', {
      updatedFields: updateResponse.data.updatedFields,
      newAmount: updateResponse.data.transaction.amount,
    });

    // Test 9: Update User Profile
    console.log('\n9. Testing PUT /users/profile (Update User Profile)');
    const profileUpdate = {
      preferences: {
        currency: 'CAD',
        budgetAlerts: false,
        weeklyReports: true,
      },
    };

    const updateUserResponse = await axios.put(
      `${API_BASE_URL}/users/profile`,
      profileUpdate,
      { headers }
    );
    console.log('SUCCESS: User Profile Updated:', {
      updatedFields: updateUserResponse.data.updatedFields,
      newCurrency: updateUserResponse.data.profile.preferences.currency,
    });

    // Test 10: Delete a Transaction
    console.log(
      '\n10. Testing DELETE /transactions/{timestamp} (Delete Transaction)'
    );
    const transactionToDelete = createdExpenses[createdExpenses.length - 1]; // Delete last expense
    const deleteResponse = await axios.delete(
      `${API_BASE_URL}/transactions/${transactionToDelete.timestamp}`,
      { headers }
    );
    console.log('SUCCESS: Transaction Deleted:', {
      deletedTransaction: deleteResponse.data.deletedTransaction.description,
      amount: deleteResponse.data.deletedTransaction.amount,
    });

    // Test 11: Verify Deletion
    console.log('\n11. Testing GET /transactions (Verify Deletion)');
    const finalResponse = await axios.get(`${API_BASE_URL}/transactions`, {
      headers,
    });
    console.log('SUCCESS: Final Transaction Count:', {
      totalTransactions: finalResponse.data.summary.totalTransactions,
      netAmount: finalResponse.data.summary.netAmount,
    });

    console.log('\nPhase 1 Testing Complete! All APIs working correctly.');
  } catch (error) {
    console.error('FAILED: Phase 1 Test Failed:', {
      status: error.response?.status,
      message: error.response?.data?.error || error.message,
      endpoint: error.config?.url,
    });
  }
}

// Test backward compatibility with existing APIs
async function testBackwardCompatibility(accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  console.log(
    '\nTesting Backward Compatibility (Existing Budget/Expense APIs)\n'
  );

  try {
    // Test existing budget API
    console.log('1. Testing Legacy POST /budgets');
    const budget = {
      budgetId: 'budget-' + Date.now(),
      name: 'Legacy Test Budget',
      amount: 1000,
    };

    const budgetResponse = await axios.post(`${API_BASE_URL}/budgets`, budget, {
      headers,
    });
    console.log('SUCCESS: Legacy Budget API Still Working');

    console.log('\n2. Testing Legacy GET /budgets');
    const getBudgetsResponse = await axios.get(`${API_BASE_URL}/budgets`, {
      headers,
    });
    console.log('SUCCESS: Legacy Get Budgets API Still Working:', {
      budgetCount: getBudgetsResponse.data.length,
    });

    console.log(
      '\nSUCCESS: Backward Compatibility Confirmed - Legacy APIs Still Function'
    );
  } catch (error) {
    console.error('FAILED: Backward Compatibility Failed:', {
      status: error.response?.status,
      message: error.response?.data?.error || error.message,
    });
  }
}

// Main test function
async function main() {
  const token = process.argv[2];

  if (!token) {
    console.log('Usage: node test-phase1.js <ACCESS_TOKEN>');
    console.log('\nTo get an access token, run: node test-auth.js');
    return;
  }

  await testPhase1APIs(token);
  await testBackwardCompatibility(token);
}

main().catch(console.error);

module.exports = { testPhase1APIs, testBackwardCompatibility };
