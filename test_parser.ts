import { parseCommand } from './src/core/commands/commandParser';

const suites = [
  // 1. Arabic explicit task creation
  {
    name: '1. Arabic explicit task creation',
    input: 'أضف مهمة إعداد العرض التقديمي',
    expectedAction: 'create_task',
    expectedPriority: 'medium',
  },
  // 2. Arabic high priority
  {
    name: '2. Arabic high priority',
    input: 'اضف مهمه مراجعه كود المشروع اولويه قصوى',
    expectedAction: 'create_task',
    expectedPriority: 'high',
  },
  // 3. Arabic medium priority
  {
    name: '3. Arabic medium priority',
    input: 'اضف لي مهمه تحديث المستندات اولويه متوسطه',
    expectedAction: 'create_task',
    expectedPriority: 'medium',
  },
  // 4. Arabic low priority
  {
    name: '4. Arabic low priority',
    input: 'سجل مهمه تنظيف بريد العمل اولويه اعتياديه',
    expectedAction: 'create_task',
    expectedPriority: 'low',
  },
  // 5. Arabic today
  {
    name: '5. Arabic today',
    input: 'اعمل مهمه ارسال الفاتوره النهاردة',
    expectedAction: 'create_task',
    checkDateOffset: 0,
  },
  // 6. Arabic tomorrow
  {
    name: '6. Arabic tomorrow',
    input: 'اضفلي مهمه مقابله العميل بكره اولويه عاليه',
    expectedAction: 'create_task',
    checkDateOffset: 1,
    expectedPriority: 'high',
  },
  // 7. English task creation
  {
    name: '7. English task creation',
    input: 'Add task Deploy container to production',
    expectedAction: 'create_task',
    expectedPriority: 'medium',
  },
  // 8. English high priority
  {
    name: '8. English high priority',
    input: 'Create task Fix critical bug high priority tomorrow',
    expectedAction: 'create_task',
    expectedPriority: 'high',
    checkDateOffset: 1,
  },
  // 9. Normal conversational message must NOT become a command
  {
    name: '9. Conversational query (general)',
    input: 'ما هي أفضل طريقة لتنظيم المهام؟',
    expectedAction: null,
  },
  {
    name: '9b. Conversational query (about tasks)',
    input: 'عندي مهام كثيرة اليوم وأحتاج نصيحة',
    expectedAction: null,
  },
  {
    name: '9c. Conversational query (English)',
    input: 'How should I organize my tasks today?',
    expectedAction: null,
  },
  // 10. Existing navigation command must still work
  {
    name: '10. Existing navigation command (Planner)',
    input: 'افتح المخطط',
    expectedAction: 'navigate',
    expectedRoute: 'planner',
  },
  {
    name: '10b. Existing navigation command (Notes)',
    input: 'افتح الملاحظات',
    expectedAction: 'navigate',
    expectedRoute: 'notes',
  },
  // 11. Ambiguous/incomplete task text must NOT create a command
  {
    name: '11. Incomplete task text',
    input: 'اضف مهمه:',
    expectedAction: null,
  },
  {
    name: '11b. Just the prefix',
    input: 'اضف مهمه',
    expectedAction: null,
  },
];

let failed = 0;
const d0 = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = d0.getFullYear() + '-' + pad(d0.getMonth() + 1) + '-' + pad(d0.getDate());
const d1 = new Date();
d1.setDate(d1.getDate() + 1);
const tomorrowStr = d1.getFullYear() + '-' + pad(d1.getMonth() + 1) + '-' + pad(d1.getDate());

for (const t of suites) {
  const res = parseCommand(t.input);
  if (t.expectedAction === null) {
    if (res.isCommand) {
      console.error('FAIL [Expected NOT command]:', t.name, res);
      failed++;
    } else {
      console.log('PASS:', t.name);
    }
  } else {
    if (!res.isCommand || !res.command || res.command.action !== t.expectedAction) {
      console.error('FAIL [Action mismatch]:', t.name, res);
      failed++;
    } else {
      if (t.expectedPriority && res.command.taskPayload?.priority !== t.expectedPriority) {
        console.error('FAIL [Priority mismatch]:', t.name, res.command.taskPayload);
        failed++;
      } else if (t.checkDateOffset !== undefined) {
        const expectedDate = t.checkDateOffset === 1 ? tomorrowStr : todayStr;
        if (res.command.taskPayload?.date !== expectedDate) {
          console.error('FAIL [Date mismatch]:', t.name, res.command.taskPayload?.date, 'vs', expectedDate);
          failed++;
        } else {
          console.log('PASS:', t.name);
        }
      } else if (t.expectedRoute && res.command.targetRoute !== t.expectedRoute) {
        console.error('FAIL [Route mismatch]:', t.name, res.command.targetRoute);
        failed++;
      } else {
        console.log('PASS:', t.name);
      }
    }
  }
}

if (failed > 0) {
  console.error(failed + ' parser tests failed');
  process.exit(1);
} else {
  console.log('ALL 14 PARSER VERIFICATION TESTS PASSED!');
}
