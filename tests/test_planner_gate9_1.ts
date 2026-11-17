import {
  parsePlanAssistResponse,
  validatePlanAssistSuggestion,
  isDuplicateSuggestion,
  buildPlanAssistSystemPrompt,
  buildScopedPlanAssistNOVOContext,
  PlanAssistService,
} from './src/modules/planner/services/planAssistService';
import {
  PlanAssistPlanningContext,
  PlanAssistSuggestion,
} from './src/modules/planner/services/planAssistTypes';
import { useTaskStore } from './src/core/state/taskStore';
import { AIOrchestrator } from './src/core/ai/aiOrchestrator';
import { ChatOrchestrationRequest, ChatOrchestrationResult } from './src/core/ai/aiTypes';
import { Task, Goal } from './src/types/data';

function runGate9_1Tests() {
  console.log('Running Gate 9.1 Tests (AI Plan Assist Service & Strict Parser)');
  let passed = true;

  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  // Mock sample tasks and goals
  const mockTasks: Task[] = [
    {
      id: 'task-1',
      title: 'Review Q3 Metrics',
      date: '2026-09-20',
      completed: false,
      priority: 'medium',
      createdAt: '2026-09-18T10:00:00Z',
    },
    {
      id: 'task-2',
      title: 'Submit Expense Report',
      date: '2026-09-20',
      completed: true,
      priority: 'low',
      createdAt: '2026-09-18T11:00:00Z',
    },
  ];

  const mockGoals: Goal[] = [
    {
      id: 'goal-1',
      title: 'Launch MVP',
      description: 'Ship initial release to beta users',
      progress: 65,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-18T00:00:00Z',
    },
  ];

  const basePlanningContext: PlanAssistPlanningContext = {
    selectedDate: '2026-09-20',
    existingTasks: mockTasks,
    activeGoals: mockGoals,
    focusMinutes: 45,
    language: 'en',
  };

  // 1. Valid structured AI response parses correctly.
  {
    const rawJson = JSON.stringify({
      summary: 'Focus on reviewing metrics and drafting release notes.',
      suggestions: [
        {
          type: 'new_task',
          title: 'Draft Release Notes',
          priority: 'high',
          reason: 'Supports Launch MVP goal for upcoming deployment',
        },
        {
          type: 'priority_change',
          taskId: 'task-1',
          priority: 'high',
          reason: 'Need metrics completed before team sync',
        },
      ],
    });

    const res = parsePlanAssistResponse(rawJson);
    const valid =
      res.success &&
      res.data.summary === 'Focus on reviewing metrics and drafting release notes.' &&
      res.data.suggestions.length === 2;
    logResult('G9.1-01', valid, 'Valid structured AI response parses correctly.');
  }

  // 2. new_task suggestion parses correctly.
  {
    const raw = {
      type: 'new_task',
      title: 'Prepare Slide Deck',
      priority: 'medium',
      reason: 'Essential for investor presentation',
    };
    const validated = validatePlanAssistSuggestion(raw);
    const valid =
      validated !== null &&
      validated.type === 'new_task' &&
      validated.title === 'Prepare Slide Deck' &&
      validated.priority === 'medium' &&
      validated.reason === 'Essential for investor presentation';
    logResult('G9.1-02', valid, 'new_task suggestion parses correctly.');
  }

  // 3. priority_change suggestion parses correctly.
  {
    const raw = {
      type: 'priority_change',
      taskId: 'task-1',
      priority: 'high',
      reason: 'High urgency for today',
    };
    const validated = validatePlanAssistSuggestion(raw);
    const valid =
      validated !== null &&
      validated.type === 'priority_change' &&
      validated.taskId === 'task-1' &&
      validated.priority === 'high' &&
      validated.reason === 'High urgency for today';
    logResult('G9.1-03', valid, 'priority_change suggestion parses correctly.');
  }

  // 4. Missing required fields are rejected.
  {
    const missingTitle = {
      type: 'new_task',
      priority: 'high',
      reason: 'Missing title',
    };
    const missingReason = {
      type: 'new_task',
      title: 'Some Task',
      priority: 'high',
    };
    const missingTaskId = {
      type: 'priority_change',
      priority: 'high',
      reason: 'Missing taskId',
    };

    const valid =
      validatePlanAssistSuggestion(missingTitle) === null &&
      validatePlanAssistSuggestion(missingReason) === null &&
      validatePlanAssistSuggestion(missingTaskId) === null;
    logResult('G9.1-04', valid, 'Missing required fields are rejected.');
  }

  // 5. Invalid priority is rejected.
  {
    const invalidPriorityNew = {
      type: 'new_task',
      title: 'Task A',
      priority: 'urgent_critical', // Invalid
      reason: 'Some reason',
    };
    const invalidPriorityChange = {
      type: 'priority_change',
      taskId: 'task-1',
      priority: 'super_low', // Invalid
      reason: 'Some reason',
    };

    const valid =
      validatePlanAssistSuggestion(invalidPriorityNew) === null &&
      validatePlanAssistSuggestion(invalidPriorityChange) === null;
    logResult('G9.1-05', valid, 'Invalid priority is rejected.');
  }

  // 6. Unknown suggestion type is rejected.
  {
    const unknownType = {
      type: 'delete_task',
      taskId: 'task-1',
      reason: 'Should not exist',
    };
    const valid = validatePlanAssistSuggestion(unknownType) === null;
    logResult('G9.1-06', valid, 'Unknown suggestion type is rejected.');
  }

  // 7. Empty title is rejected.
  {
    const emptyTitle = {
      type: 'new_task',
      title: '   ',
      priority: 'high',
      reason: 'Valid reason',
    };
    const valid = validatePlanAssistSuggestion(emptyTitle) === null;
    logResult('G9.1-07', valid, 'Empty title is rejected.');
  }

  // 8. Empty reason is rejected.
  {
    const emptyReason = {
      type: 'new_task',
      title: 'Valid Title',
      priority: 'high',
      reason: '',
    };
    const valid = validatePlanAssistSuggestion(emptyReason) === null;
    logResult('G9.1-08', valid, 'Empty reason is rejected.');
  }

  // 9. Malformed JSON is handled safely.
  {
    const brokenJson = '{ "summary": "Broken", suggestions: [ invalid json ...';
    const res = parsePlanAssistResponse(brokenJson);
    const valid =
      !res.success &&
      (res as any).error.code === 'MALFORMED_OUTPUT' &&
      (res as any).error.isAborted === false;
    logResult('G9.1-09', valid, 'Malformed JSON is handled safely.');
  }

  // 10. Accidental fenced JSON is handled safely if supported.
  {
    const fencedJson = `\`\`\`json
{
  "summary": "Plan within markdown fence",
  "suggestions": [
    {
      "type": "new_task",
      "title": "Fenced Task",
      "priority": "low",
      "reason": "Test markdown fence extraction"
    }
  ]
}
\`\`\``;
    const res = parsePlanAssistResponse(fencedJson);
    const firstSugg = res.success ? res.data.suggestions[0] : null;
    const valid =
      res.success &&
      res.data.summary === 'Plan within markdown fence' &&
      res.data.suggestions.length === 1 &&
      firstSugg !== null &&
      firstSugg.type === 'new_task' &&
      firstSugg.title === 'Fenced Task';
    logResult('G9.1-10', valid, 'Accidental fenced JSON is handled safely.');
  }

  // 11. Empty response is handled safely.
  {
    const empty1 = parsePlanAssistResponse('');
    const empty2 = parsePlanAssistResponse('   \n  ');
    const valid =
      !empty1.success &&
      (empty1 as any).error.code === 'EMPTY_OUTPUT' &&
      !empty2.success &&
      (empty2 as any).error.code === 'EMPTY_OUTPUT';
    logResult('G9.1-11', valid, 'Empty response is handled safely.');
  }

  // Async Tests using mock Orchestrator
  (async () => {
    // 12. API/service failure is returned safely.
    {
      class FailingOrchestrator extends AIOrchestrator {
        async orchestrate(): Promise<ChatOrchestrationResult> {
          return {
            handledAsCommand: false,
            error: {
              code: 'REQUEST_FAILED',
              message: 'Simulated AI server failure',
              retryable: true,
            },
          };
        }
      }

      const service = new PlanAssistService(new FailingOrchestrator());
      const res = await service.getPlanSuggestions(basePlanningContext);
      const valid =
        !res.success &&
        (res as any).error.code === 'API_ERROR' &&
        (res as any).error.isAborted === false &&
        (res as any).error.message.includes('Simulated AI server failure');
      logResult('G9.1-12', valid, 'API/service failure is returned safely.');
    }

    // 13. AbortSignal cancellation is handled distinctly.
    {
      class AbortingOrchestrator extends AIOrchestrator {
        async orchestrate(req: ChatOrchestrationRequest): Promise<ChatOrchestrationResult> {
          if (req.options?.abortSignal?.aborted) {
            return {
              handledAsCommand: false,
              error: {
                code: 'ABORTED',
                message: 'The request was cancelled.',
                retryable: true,
              },
            };
          }
          return {
            handledAsCommand: false,
            aiResponse: { text: '{"summary":"foo","suggestions":[]}' },
          };
        }
      }

      const service = new PlanAssistService(new AbortingOrchestrator());
      const controller = new AbortController();
      controller.abort(); // Pre-abort

      const res = await service.getPlanSuggestions(basePlanningContext, {
        abortSignal: controller.signal,
      });

      const valid =
        !res.success &&
        (res as any).error.code === 'ABORTED' &&
        (res as any).error.isAborted === true;
      logResult('G9.1-13', valid, 'AbortSignal cancellation is handled distinctly.');
    }

    // 14. selectedDate is included in the generated request/context.
    {
      let capturedRequest: ChatOrchestrationRequest | null = null;
      class CapturingOrchestrator extends AIOrchestrator {
        async orchestrate(req: ChatOrchestrationRequest): Promise<ChatOrchestrationResult> {
          capturedRequest = req;
          return {
            handledAsCommand: false,
            aiResponse: {
              text: JSON.stringify({
                summary: 'Valid test plan',
                suggestions: [],
              }),
            },
          };
        }
      }

      const service = new PlanAssistService(new CapturingOrchestrator());
      const customDateContext: PlanAssistPlanningContext = {
        ...basePlanningContext,
        selectedDate: '2027-12-31', // Non-today future date
      };

      await service.getPlanSuggestions(customDateContext);

      const sysInstruction = capturedRequest?.options?.systemInstruction || '';
      const prompt = capturedRequest?.message || '';
      const contextDate = capturedRequest?.context?.date;

      const valid =
        sysInstruction.includes('2027-12-31') &&
        prompt.includes('2027-12-31') &&
        contextDate === '2027-12-31';

      logResult(
        'G9.1-14',
        valid,
        'selectedDate is included in generated request/context.'
      );
    }

    // 15. The service does NOT mutate taskStore.
    {
      const initialTaskCount = useTaskStore.getState().tasks.length;
      const initialTasksJson = JSON.stringify(useTaskStore.getState().tasks);

      class SuccessOrchestrator extends AIOrchestrator {
        async orchestrate(): Promise<ChatOrchestrationResult> {
          return {
            handledAsCommand: false,
            aiResponse: {
              text: JSON.stringify({
                summary: 'Suggested plan',
                suggestions: [
                  {
                    type: 'new_task',
                    title: 'Should Not Be Added Directly',
                    priority: 'high',
                    reason: 'Must not auto-mutate store',
                  },
                ],
              }),
            },
          };
        }
      }

      const service = new PlanAssistService(new SuccessOrchestrator());
      const res = await service.getPlanSuggestions(basePlanningContext);

      const currentTaskCount = useTaskStore.getState().tasks.length;
      const currentTasksJson = JSON.stringify(useTaskStore.getState().tasks);

      const valid =
        res.success &&
        res.data.suggestions.length === 1 &&
        initialTaskCount === currentTaskCount &&
        initialTasksJson === currentTasksJson;

      logResult('G9.1-15', valid, 'The service does NOT mutate taskStore.');
    }

    // 16. The service uses the existing aiOrchestrator pipeline rather than introducing a new direct Gemini client.
    {
      let orchestratorCalled = false;
      class TrackingOrchestrator extends AIOrchestrator {
        async orchestrate(req: ChatOrchestrationRequest): Promise<ChatOrchestrationResult> {
          orchestratorCalled = true;
          return {
            handledAsCommand: false,
            aiResponse: {
              text: JSON.stringify({ summary: 'Tracked', suggestions: [] }),
            },
          };
        }
      }

      const service = new PlanAssistService(new TrackingOrchestrator());
      await service.getPlanSuggestions(basePlanningContext);

      logResult(
        'G9.1-16',
        orchestratorCalled,
        'The service uses the existing aiOrchestrator pipeline.'
      );
    }

    // 17. No unrelated NOVOContext data is unnecessarily added to the Plan Assist payload if the existing architecture allows scoped context.
    {
      const scopedContext = buildScopedPlanAssistNOVOContext(basePlanningContext);
      const systemPrompt = buildPlanAssistSystemPrompt(basePlanningContext);

      // Verify no finance or notes data leaked into scoped context or prompt
      const scopedHasZeroFinance =
        scopedContext.moneySummary.currentBalance === 0 &&
        scopedContext.moneySummary.recentSpending === 0 &&
        scopedContext.financeSummary.currentBalance === 0;

      const scopedHasZeroNotes =
        scopedContext.notesCount === 0 &&
        scopedContext.recentNotes.length === 0 &&
        scopedContext.recentKnowledge.length === 0;

      const promptExcludesUnrelated =
        !systemPrompt.includes('Balance:') &&
        !systemPrompt.includes('Finances & Budget') &&
        !systemPrompt.includes('Knowledge Vault');

      const valid =
        scopedHasZeroFinance && scopedHasZeroNotes && promptExcludesUnrelated;

      logResult(
        'G9.1-17',
        valid,
        'No unrelated NOVOContext data is unnecessarily added to Plan Assist payload.'
      );
    }

    // Extra: Duplicate detection helper tests
    {
      const existing = [
        { id: 'task-1', title: 'Buy Groceries', priority: 'medium' },
        { id: 'task-2', title: 'Write Report', priority: 'high' },
      ];

      const duplicateNewTask: PlanAssistSuggestion = {
        type: 'new_task',
        title: ' buy groceries ', // Case and whitespace variation
        priority: 'low',
        reason: 'Duplicate check',
      };

      const nonDuplicateNewTask: PlanAssistSuggestion = {
        type: 'new_task',
        title: 'Walk the dog',
        priority: 'low',
        reason: 'New task',
      };

      const duplicatePriorityChange: PlanAssistSuggestion = {
        type: 'priority_change',
        taskId: 'task-1',
        priority: 'medium', // Already medium
        reason: 'No change',
      };

      const validPriorityChange: PlanAssistSuggestion = {
        type: 'priority_change',
        taskId: 'task-1',
        priority: 'high', // Changing medium -> high
        reason: 'Valid change',
      };

      const dupNew = isDuplicateSuggestion(duplicateNewTask, existing);
      const nonDupNew = !isDuplicateSuggestion(nonDuplicateNewTask, existing);
      const dupPrio = isDuplicateSuggestion(duplicatePriorityChange, existing);
      const nonDupPrio = !isDuplicateSuggestion(validPriorityChange, existing);

      const valid = dupNew && nonDupNew && dupPrio && nonDupPrio;
      logResult('G9.1-18', valid, 'Duplicate detection helper works accurately.');
    }

    // Final result
    if (passed) {
      console.log('ALL GATE 9.1 TESTS PASSED');
      process.exit(0);
    } else {
      console.error('SOME GATE 9.1 TESTS FAILED');
      process.exit(1);
    }
  })();
}

runGate9_1Tests();
