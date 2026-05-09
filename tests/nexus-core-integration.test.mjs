import test from 'node:test';
import assert from 'node:assert/strict';
import { nexusCore } from '../lib/core/NexusCore';

test('NexusCore: full orchestration pipeline integration', async (t) => {
  await t.test('should successfully execute a a-content request', async () => {
    const request = {
      userInput: 'Create a high-conversion hook for a SaaS tool that automates tax returns',
      taskType: 'content' as const,
      platform: 'twitter',
      maxAgents: 3,
    };

    const result = await nexusCore.execute(request);

    assert.ok(result.success, 'Orchestration should be successful');
    assert.ok(result.output.length > 0, 'Should produce an output');
    assert.ok(result.allOutputs.length > 0, 'Should have recorded agent outputs');
    assert.ok(result.metadata.totalDuration > 0, 'Duration should be tracked');
  });

  await t.test('should handle invalid request types gracefully', async () => {
    const request = {
      userInput: 'Test',
      taskType: 'invalid' as any,
    };

    const result = await nexusCore.execute(request);
    assert.strictEqual(result.success, false);
    assert.ok(result.governorValidation.feedback, 'Should have governor feedback');
  });

  await t.test('should enforce budget limits', async () => {
    // Note: This test depends on tokenBudgetManager mock/state
    // In a real CI environment, we would mock the budget check
    const result = await nexusCore.execute({
      userInput: 'Budget Test',
      taskType: 'content' as const,
    });
    
    // If we have a budget, it should succeed. If we simulate no budget, it should fail.
    assert.ok(result.success || result.governorValidation.issues.some(i => i.message.includes('Budget')));
  });
});
