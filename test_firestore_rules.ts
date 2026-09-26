import { initializeTestEnvironment, assertFails, assertSucceeds, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { setDoc, doc, getDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

async function runTests() {
  let passed = true;

  try {
    testEnv = await initializeTestEnvironment({
      projectId: 'novo-security-test',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
        host: process.env.FIRESTORE_EMULATOR_HOST ? process.env.FIRESTORE_EMULATOR_HOST.split(':')[0] : '127.0.0.1',
        port: process.env.FIRESTORE_EMULATOR_HOST ? parseInt(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1]) : 8080,
      },
    });
  } catch (err) {
    console.error('Failed to initialize test environment:', err);
    process.exit(1);
  }

  const unauthedDb = testEnv.unauthenticatedContext().firestore();
  const aliceDb = testEnv.authenticatedContext('user_alice').firestore();
  const bobDb = testEnv.authenticatedContext('user_bob').firestore();

  const logResult = (testId: string, result: boolean, desc: string) => {
    console.log(`[${result ? 'PASS' : 'FAIL'}] ${testId}: ${desc}`);
    if (!result) passed = false;
  };

  await testEnv.clearFirestore();

  console.log('--- BASIC CRUD AUTHORIZATION (Tasks) ---');

  // SEC-01 to SEC-04: Unauthenticated
  try {
    await assertFails(getDoc(doc(unauthedDb, 'users/user_alice/tasks/task1')));
    logResult('SEC-01', true, 'unauthenticated read denied');
  } catch (e) { logResult('SEC-01', false, 'unauthenticated read not denied'); }

  try {
    await assertFails(setDoc(doc(unauthedDb, 'users/user_alice/tasks/task1'), { title: 'Test' }));
    logResult('SEC-02', true, 'unauthenticated create denied');
  } catch (e) { logResult('SEC-02', false, 'unauthenticated create not denied'); }

  try {
    await assertFails(updateDoc(doc(unauthedDb, 'users/user_alice/tasks/task1'), { title: 'Test2' }));
    logResult('SEC-03', true, 'unauthenticated update denied');
  } catch (e) { logResult('SEC-03', false, 'unauthenticated update not denied'); }

  try {
    await assertFails(deleteDoc(doc(unauthedDb, 'users/user_alice/tasks/task1')));
    logResult('SEC-04', true, 'unauthenticated delete denied');
  } catch (e) { logResult('SEC-04', false, 'unauthenticated delete not denied'); }

  // SEC-05 to SEC-08: Same User
  try {
    await assertSucceeds(setDoc(doc(aliceDb, 'users/user_alice/tasks/task1'), { title: 'Test' }));
    logResult('SEC-06', true, 'same-user task create allowed');
  } catch (e) { logResult('SEC-06', false, 'same-user task create failed'); }

  try {
    await assertSucceeds(getDoc(doc(aliceDb, 'users/user_alice/tasks/task1')));
    logResult('SEC-05', true, 'same-user task read allowed');
  } catch (e) { logResult('SEC-05', false, 'same-user task read failed'); }

  try {
    await assertSucceeds(updateDoc(doc(aliceDb, 'users/user_alice/tasks/task1'), { title: 'Test2' }));
    logResult('SEC-07', true, 'same-user task update allowed');
  } catch (e) { logResult('SEC-07', false, 'same-user task update failed'); }

  try {
    await assertSucceeds(deleteDoc(doc(aliceDb, 'users/user_alice/tasks/task1')));
    logResult('SEC-08', true, 'same-user task delete allowed');
  } catch (e) { logResult('SEC-08', false, 'same-user task delete failed'); }

  // SEC-09 to SEC-12: Cross User (Malicious Substitution)
  // Seed a document for Bob so Alice can try to touch it
  await assertSucceeds(setDoc(doc(bobDb, 'users/user_bob/tasks/task2'), { title: 'BobTask' }));

  try {
    await assertFails(getDoc(doc(aliceDb, 'users/user_bob/tasks/task2')));
    logResult('SEC-09', true, 'cross-user task read denied');
  } catch (e) { logResult('SEC-09', false, 'cross-user task read not denied'); }

  try {
    await assertFails(setDoc(doc(aliceDb, 'users/user_bob/tasks/task3'), { title: 'AliceFake' }));
    logResult('SEC-10', true, 'cross-user task create denied');
  } catch (e) { logResult('SEC-10', false, 'cross-user task create not denied'); }

  try {
    await assertFails(updateDoc(doc(aliceDb, 'users/user_bob/tasks/task2'), { title: 'Hacked' }));
    logResult('SEC-11', true, 'cross-user task update denied');
  } catch (e) { logResult('SEC-11', false, 'cross-user task update not denied'); }

  try {
    await assertFails(deleteDoc(doc(aliceDb, 'users/user_bob/tasks/task2')));
    logResult('SEC-12', true, 'cross-user task delete denied');
  } catch (e) { logResult('SEC-12', false, 'cross-user task delete not denied'); }

  logResult('SEC-14', passed, 'malicious UID substitution completely denied (see SEC-09..12)');

  console.log('\n--- REPRESENTATIVE COVERAGE (Same-user Allow, Cross-user Deny) ---');
  
  const resources = [
    { name: 'GOALS', path: 'goals/g1' },
    { name: 'NOTES', path: 'notes/n1' },
    { name: 'KNOWLEDGE', path: 'knowledge/k1' },
    { name: 'MONEY', path: 'money/m1' },
    { name: 'FOCUS_SESSIONS', path: 'focus_sessions/fs1' },
    { name: 'CONVERSATIONS', path: 'conversations/c1' },
    { name: 'ACTIVE_FOCUS', path: 'active_state/focus' },
    { name: 'ACTIVE_CHAT', path: 'active_state/chat' },
  ];

  for (const r of resources) {
    let rPass = true;
    try {
      await assertSucceeds(setDoc(doc(aliceDb, `users/user_alice/${r.path}`), { val: 1 }));
    } catch(e) { console.log(e); rPass = false; }
    
    try {
      await assertFails(getDoc(doc(bobDb, `users/user_alice/${r.path}`)));
      await assertFails(setDoc(doc(bobDb, `users/user_alice/${r.path}`), { val: 2 }));
    } catch(e) { console.log(e); rPass = false; }
    
    logResult(r.name, rPass, `Read/Write allowed for self, denied for cross-user`);
  }

  let migPass = true;
  try {
    await assertSucceeds(setDoc(doc(aliceDb, 'users/user_alice/metadata/migration'), { status: 'COMPLETED' }));
    await assertFails(setDoc(doc(bobDb, 'users/user_alice/metadata/migration'), { status: 'HACKED' }));
  } catch(e) { migPass = false; }
  logResult('MIGRATION_MARKER', migPass, 'Self can write, other denied');
  logResult('SEC-15', migPass, 'authenticated user cannot write another user\'s migration marker');

  console.log('\n--- UNKNOWN COLLECTION ---');
  try {
    await assertFails(setDoc(doc(aliceDb, 'users/user_alice/future_collection/test'), { data: 1 }));
    await assertFails(getDoc(doc(aliceDb, 'users/user_alice/future_collection/test')));
    logResult('SEC-13', true, 'unknown/unrecognized collection denied');
    logResult('UNKNOWN_COLLECTION', true, 'Future collections are blocked by default deny');
  } catch (e) {
    logResult('SEC-13', false, 'unknown collection was allowed!');
    logResult('UNKNOWN_COLLECTION', false, 'Future collections allowed');
  }

  console.log('\n--- BATCH WRITES ---');
  try {
    const batch1 = writeBatch(aliceDb);
    batch1.set(doc(aliceDb, 'users/user_alice/tasks/b1'), { val: 1 });
    batch1.set(doc(aliceDb, 'users/user_alice/notes/b2'), { val: 2 });
    await assertSucceeds(batch1.commit());
    
    const batch2 = writeBatch(aliceDb);
    batch2.set(doc(aliceDb, 'users/user_alice/tasks/b3'), { val: 3 });
    // malicious injection of Bob's document
    batch2.set(doc(aliceDb, 'users/user_bob/tasks/b4'), { val: 4 });
    await assertFails(batch2.commit());
    logResult('BATCH_CROSS_USER', true, 'Batch containing cross-user write correctly denied whole batch');
  } catch (e) {
    logResult('BATCH_CROSS_USER', false, 'Batch rules failed');
  }

  await testEnv.cleanup();
  
  if (!passed) {
    console.error('\nSOME SECURITY TESTS FAILED.');
    process.exit(1);
  } else {
    console.log('\nALL SECURITY TESTS PASSED.');
  }
}

runTests();
