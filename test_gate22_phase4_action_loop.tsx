import React, { useEffect, useRef } from 'react';
import { act, create } from 'react-test-renderer';

import ProactiveOSSurface from './src/modules/home/components/ProactiveOSSurface';
import { useIntelligence } from './src/core/intelligence/useIntelligence';
import { useTaskStore } from './src/core/state/taskStore';
import { evaluateWorkspaceIntelligence } from './src/core/intelligence/intelligenceOrchestrator';
import { captureWorkspaceSnapshot } from './src/core/intelligence/workspaceSnapshotBuilder';

import fs from 'node:fs';
import path from 'node:path';

type TestTask = {
  id: string;
  title: string;
  completed: boolean;
  date: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
};

const TODAY = new Date().toISOString().slice(0, 10);

const TARGET_TASK: TestTask = {
  id: 'gate22-action-target',
  title: 'Gate 22 executable task',
  completed: false,
  date: TODAY,
  priority: 'high',
  createdAt: new Date().toISOString(),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Test failed: ${message}`);
  }
}

function getNextActionSnapshot() {
  const state = useTaskStore.getState();

  const snapshot = captureWorkspaceSnapshot(
    {
      tasks: state.tasks,
      goals: [],
      notes: [],
      knowledgeItems: [],
      transactions: [],
      sessions: [],
      conversations: [],
      activeFocusState: null,
      activeConversationId: null,
    },
    new Date()
  );

  return evaluateWorkspaceIntelligence(snapshot, new Date()).nextAction;
}

function IntelligenceProbe({
  onContext,
}: {
  onContext: (nextAction: ReturnType<typeof useIntelligence>['nextAction']) => void;
}) {
  const { nextAction } = useIntelligence();

  useEffect(() => {
    onContext(nextAction);
  }, [nextAction, onContext]);

  return null;
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function main() {
  console.log('============================================================');
  console.log('GATE 22 PHASE 4A — FIRST REAL ACTION LOOP');
  console.log('============================================================');

  const taskStoreBefore = useTaskStore.getState();

  const originalToggleTask = taskStoreBefore.toggleTask;
  // حفظ الدالة الأصلية
  const originalUpdateTask = taskStoreBefore.updateTask; 

  let toggleInvocationCount = 0;
  const toggleTaskArguments: string[] = [];
  
  // نقلنا root هنا عشان يكون مقروء في الـ finally
  let root: any; 

  useTaskStore.setState({
    tasks: [TARGET_TASK as any],
    status: 'ready',
    error: null,
    toggleTask: async (taskId: string) => {
      toggleInvocationCount += 1;
      toggleTaskArguments.push(taskId);

      await originalToggleTask(taskId);
    },
    // إيقاف التعامل مع قاعدة البيانات مؤقتاً في بيئة الاختبار لتجنب خطأ الـ Auth
    updateTask: async (id: string, updates: any) => {
      const state = useTaskStore.getState();
      const tasks = state.tasks.map(t => (t.id === id ? { ...t, ...updates } : t));
      useTaskStore.setState({ tasks });
    }
  });

  try {
    /*
     * ----------------------------------------------------------
     * G22-01
     * Canonical next-action selection points at the target task.
     * ----------------------------------------------------------
     */
    const initialNextAction = getNextActionSnapshot();

    assert(
      initialNextAction.type === 'existing_task',
      `Expected existing_task, received ${initialNextAction.type}`
    );

    assert(
      initialNextAction.selectedTaskId === TARGET_TASK.id,
      `Expected selectedTaskId=${TARGET_TASK.id}, received ${initialNextAction.selectedTaskId}`
    );

    assert(
      useTaskStore.getState().tasks.find(
        task => task.id === TARGET_TASK.id
      )?.completed === false,
      'Target task must initially be incomplete'
    );

    console.log(
      '[PASS] G22-01: Canonical nextAction selects the existing target task'
    );

    /*
     * ----------------------------------------------------------
     * G22-02
     * Mount the real ProactiveOSSurface.
     * ----------------------------------------------------------
     */
    let observedNextAction:
      | ReturnType<typeof useIntelligence>['nextAction']
      | null = null;

    const handleExecuteNextAction = async (taskId: string) => {
      await useTaskStore.getState().toggleTask(taskId);
    };

    await act(async () => {
      root = create(
        <>
          <ProactiveOSSurface
            onExecuteNextAction={handleExecuteNextAction}
          />

          <IntelligenceProbe
            onContext={nextAction => {
              observedNextAction = nextAction;
            }}
          />
        </>
      );
    });

    await flushReact();

    console.log(
      '[PASS] G22-02: Real ProactiveOSSurface mounted with execution callback'
    );

    /*
     * ----------------------------------------------------------
     * G22-03
     * Recommendation alone must not mutate the workspace.
     * ----------------------------------------------------------
     */
    assert(
      toggleInvocationCount === 0,
      `Recommendation rendered without confirmation must not toggle task; calls=${toggleInvocationCount}`
    );

    assert(
      useTaskStore.getState().tasks.find(
        task => task.id === TARGET_TASK.id
      )?.completed === false,
      'Target task must remain incomplete before explicit confirmation'
    );

    console.log(
      '[PASS] G22-03: Recommendation does not mutate without confirmation'
    );

    /*
     * ----------------------------------------------------------
     * G22-04
     * The explicit execution button must exist only for an
     * existing_task result.
     * ----------------------------------------------------------
     */
    const executeButton = root.root.findByProps({
      'data-testid': 'next-action-execute-btn',
    });

    assert(
      executeButton !== undefined,
      'Expected explicit next-action execute button'
    );

    console.log(
      '[PASS] G22-04: Existing-task recommendation exposes explicit execution control'
    );

    /*
     * ----------------------------------------------------------
     * G22-05
     * First click only enters confirmation state.
     * ----------------------------------------------------------
     */
    await act(async () => {
      executeButton.props.onClick();
    });

    await flushReact();

    assert(
      toggleInvocationCount === 0,
      `Opening confirmation must not toggle task; calls=${toggleInvocationCount}`
    );

    const confirmButton = root.root.findByProps({
      'data-testid': 'next-action-confirm-btn',
    });

    assert(
      confirmButton !== undefined,
      'Expected confirmation button after explicit execution request'
    );

    console.log(
      '[PASS] G22-05: First click opens confirmation without mutation'
    );

    /*
     * ----------------------------------------------------------
     * G22-06
     * Explicit confirmation invokes exactly one store mutation
     * with the canonical selectedTaskId.
     * ----------------------------------------------------------
     */
    await act(async () => {
      await confirmButton.props.onClick();
    });

    await flushReact();

    assert(
      toggleInvocationCount === 1,
      `Expected exactly one toggleTask invocation; calls=${toggleInvocationCount}`
    );

    assert(
      toggleTaskArguments.length === 1 &&
        toggleTaskArguments[0] === TARGET_TASK.id,
      `Expected toggleTask(${TARGET_TASK.id}), received ${JSON.stringify(toggleTaskArguments)}`
    );

    console.log(
      '[PASS] G22-06: Explicit confirmation invokes toggleTask exactly once with selectedTaskId'
    );

    /*
     * ----------------------------------------------------------
     * G22-07
     * Workspace state must reflect the mutation.
     * ----------------------------------------------------------
     */
    const updatedTask = useTaskStore
      .getState()
      .tasks
      .find(task => task.id === TARGET_TASK.id);

    assert(
      updatedTask?.completed === true,
      'Target task must become completed after execution'
    );

    console.log(
      '[PASS] G22-07: Workspace task state changed to completed'
    );

    /*
     * ----------------------------------------------------------
     * G22-08
     * Reactive intelligence must reevaluate from the changed
     * Zustand task state.
     * ----------------------------------------------------------
     */
    assert(
      observedNextAction !== null,
      'Expected useIntelligence probe to receive a post-mutation nextAction'
    );

    assert(
      observedNextAction?.type !== 'existing_task' ||
        observedNextAction.selectedTaskId !== TARGET_TASK.id,
      'Completed target task must no longer remain the canonical executable next action'
    );

    const reevaluatedNextAction = getNextActionSnapshot();

    assert(
      reevaluatedNextAction.type !== 'existing_task' ||
        reevaluatedNextAction.selectedTaskId !== TARGET_TASK.id,
      'Direct canonical reevaluation must not select the completed target task'
    );

    console.log(
      '[PASS] G22-08: Task mutation causes canonical intelligence reevaluation'
    );

    /*
     * ----------------------------------------------------------
     * G22-09
     * There must be no second UI-owned intelligence pipeline.
     * ----------------------------------------------------------
     */
    const proactiveSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/home/components/ProactiveOSSurface.tsx'
      ),
      'utf8'
    );

    const homeSource = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/modules/home/HomeView.tsx'
      ),
      'utf8'
    );

    assert(
      !proactiveSource.includes('evaluateWorkspaceIntelligence'),
      'ProactiveOSSurface must not call evaluateWorkspaceIntelligence directly'
    );

    assert(
      !proactiveSource.includes('nextActionEngine'),
      'ProactiveOSSurface must not import nextActionEngine'
    );

    assert(
      !homeSource.includes('evaluateWorkspaceIntelligence'),
      'HomeView must not call evaluateWorkspaceIntelligence directly'
    );

    assert(
      !homeSource.includes('nextActionEngine'),
      'HomeView must not import nextActionEngine'
    );

    assert(
      homeSource.includes('useTaskStore'),
      'HomeView must consume the task store for action execution'
    );

    assert(
      homeSource.includes('onExecuteNextAction'),
      'HomeView must wire the execution callback into ProactiveOSSurface'
    );

    assert(
      homeSource.includes('toggleTask'),
      'HomeView must wire execution to toggleTask'
    );

    console.log(
      '[PASS] G22-09: UI contains no duplicate intelligence pipeline'
    );

    /*
     * ----------------------------------------------------------
     * G22-10
     * The rendered action surface must no longer expose the
     * confirmation controls after successful execution.
     * ----------------------------------------------------------
     */
    let remainingConfirmButtons = 0;

    try {
      root.root.findByProps({
        'data-testid': 'next-action-confirm-btn',
      });
      remainingConfirmButtons += 1;
    } catch {
      // Expected after the successful execution.
    }

    assert(
      remainingConfirmButtons === 0,
      'Confirmation control must close after successful execution'
    );

    console.log(
      '[PASS] G22-10: Confirmation state closes after successful execution'
    );

    console.log('');
    console.log('============================================================');
    console.log('GATE 22 PHASE 4A — ALL TESTS PASSED');
    console.log('============================================================');
  } finally {
    await act(async () => {
      root?.unmount?.();
    });

    useTaskStore.setState({
      tasks: taskStoreBefore.tasks,
      status: taskStoreBefore.status,
      error: taskStoreBefore.error,
      lastUpdated: taskStoreBefore.lastUpdated,
      toggleTask: originalToggleTask,
      updateTask: originalUpdateTask,
    });
  }
}

main().catch(error => {
  console.error('');
  console.error('============================================================');
  console.error('GATE 22 PHASE 4A — TEST FAILURE');
  console.error('============================================================');
  console.error(error);
  process.exit(1);
});