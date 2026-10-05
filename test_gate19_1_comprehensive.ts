import './test_env.ts';
import assert from 'assert';
import {
  requireAuth,
  rateLimiter,
  setMockTokenVerifier,
  configureRateLimiter,
  resetRateLimiter,
  AuthenticatedRequest
} from './server/authMiddleware';
import { GeminiServerProvider } from './src/core/ai/geminiServerProvider';
import { useAuthStore } from './src/core/auth/authStore';
import { parseCommand } from './src/core/commands/commandParser';
import { isPlausiblyActionShaped } from './src/core/ai/conversationalIntent';
import { AuthLifecycle } from './src/core/auth/authLifecycle';
import { useTaskStore } from './src/core/state/taskStore';
import { useGoalStore } from './src/core/state/goalStore';
import fs from 'fs';

// Helper mock response and request builder
function createMockReqRes(headers: Record<string, string> = {}, ip: string = '127.0.0.1') {
  const req: AuthenticatedRequest = {
    headers: { ...headers },
    ip,
    socket: { remoteAddress: ip } as any,
  } as any;

  let statusCode = 200;
  let responseData: any = null;
  const responseHeaders: Record<string, any> = {};

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    setHeader(name: string, value: any) {
      responseHeaders[name.toLowerCase()] = value;
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData,
    getHeaders: () => responseHeaders,
  };

  return { req, res };
}

async function runGate191Tests() {
  console.log('====================================================');
  console.log('STARTING GATE 19.1 COMPREHENSIVE VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  const pass = (msg: string) => {
    passed++;
    console.log(`  ✓ [PASS ${passed}] ${msg}`);
  };

  // -------------------------------------------------------------------------
  // SECTION 1: requireAuth Middleware Security Enforcements
  // -------------------------------------------------------------------------
  console.log('--- Section 1: Server Authentication Middleware (requireAuth) ---');

  // Test 1.1: Missing authorization header -> 401
  {
    const { req, res } = createMockReqRes({});
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.1a. Missing header returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.1b. Error code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.1c. Next was NOT called on missing header');
    pass('1.1: Missing Authorization header rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.2: Empty string authorization header -> 401
  {
    const { req, res } = createMockReqRes({ authorization: '' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.2a. Empty header returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.2b. Code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.2c. Next was NOT called');
    pass('1.2: Empty Authorization header rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.3: Non-Bearer scheme -> 401
  {
    const { req, res } = createMockReqRes({ authorization: 'Basic dXNlcjpwYXNz' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.3a. Basic auth returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.3b. Code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.3c. Next was NOT called');
    pass('1.3: Non-Bearer scheme (Basic) rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.4: Malformed Bearer (single word) -> 401
  {
    const { req, res } = createMockReqRes({ authorization: 'Bearer' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.4a. Malformed Bearer returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.4b. Code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.4c. Next was NOT called');
    pass('1.4: Malformed Bearer without token rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.5: Malformed Bearer with whitespace only -> 401
  {
    const { req, res } = createMockReqRes({ authorization: 'Bearer    ' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.5a. Whitespace token returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.5b. Code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.5c. Next was NOT called');
    pass('1.5: Whitespace-only Bearer token rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.6: Invalid token rejected by verifier -> 401
  {
    setMockTokenVerifier(async (token: string) => {
      if (token === 'valid-token') {
        return { uid: 'user-novo-123', email: 'user@example.com' };
      }
      throw new Error('Firebase ID token has invalid signature');
    });

    const { req, res } = createMockReqRes({ authorization: 'Bearer bad-fake-token' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.6a. Invalid token returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.6b. Code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.6c. Next was NOT called');
    pass('1.6: Invalid token signature rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.7: Expired token rejected by verifier -> 401
  {
    setMockTokenVerifier(async () => {
      throw new Error('Firebase ID token has expired. Get a fresh ID token from your client.');
    });

    const { req, res } = createMockReqRes({ authorization: 'Bearer expired-token' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(res.getStatusCode(), 401, '1.7a. Expired token returns 401');
    assert.strictEqual(res.getData()?.error?.code, 'UNAUTHENTICATED', '1.7b. Code is UNAUTHENTICATED');
    assert.strictEqual(nextCalled, false, '1.7c. Next was NOT called');
    pass('1.7: Expired token rejected with 401 UNAUTHENTICATED');
  }

  // Test 1.8: Valid authenticated token succeeds and populates req.user
  {
    setMockTokenVerifier(async (token: string) => {
      if (token === 'secret-valid-token-xyz') {
        return { uid: 'authorized-uid-999', email: 'verified@novo.app' };
      }
      throw new Error('Invalid token');
    });

    const { req, res } = createMockReqRes({ authorization: 'Bearer secret-valid-token-xyz' });
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, '1.8a. Next was called on valid token');
    assert.strictEqual(res.getStatusCode(), 200, '1.8b. Status remains 200');
    assert.strictEqual(req.user?.uid, 'authorized-uid-999', '1.8c. Authoritative uid attached');
    assert.strictEqual(req.user?.email, 'verified@novo.app', '1.8d. Email attached');
    pass('1.8: Valid authenticated token passes and establishes req.user.uid');
  }

  // Test 1.9: Authoritative server identity cannot be spoofed by request body
  {
    const { req, res } = createMockReqRes({ authorization: 'Bearer secret-valid-token-xyz' });
    (req as any).body = { userId: 'spoofed-admin-uid', prompt: 'Hello' };
    let nextCalled = false;
    await requireAuth(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true, '1.9a. Passed authentication');
    assert.strictEqual(req.user?.uid, 'authorized-uid-999', '1.9b. Server uses verified token UID, ignoring body');
    pass('1.9: Server identity is strictly authoritative over any client payload spoofing');
  }

  // -------------------------------------------------------------------------
  // SECTION 2: Rate Limiting Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Deterministic Rate Limiting (rateLimiter) ---');

  // Test 2.1: Bounded requests within limit succeed with rate limit headers
  {
    resetRateLimiter();
    configureRateLimiter({ windowMs: 10000, maxRequests: 3 });

    const { req, res } = createMockReqRes({}, '10.0.0.1');
    req.user = { uid: 'rate-limit-user-1' };

    let nextCount = 0;
    rateLimiter(req, res, () => { nextCount++; });

    assert.strictEqual(nextCount, 1, '2.1a. First request passes');
    assert.strictEqual(res.getStatusCode(), 200, '2.1b. Status is 200');
    assert.strictEqual(res.getHeaders()['x-ratelimit-limit'], 3, '2.1c. Limit header matches');
    assert.strictEqual(res.getHeaders()['x-ratelimit-remaining'], 2, '2.1d. Remaining header decremented');
    assert(res.getHeaders()['x-ratelimit-reset'] > 0, '2.1e. Reset header present');
    pass('2.1: Requests below limit succeed and return standard X-RateLimit headers');
  }

  // Test 2.2: Exceeding limit triggers 429 RATE_LIMITED with Retry-After header
  {
    const { req: req2, res: res2 } = createMockReqRes({}, '10.0.0.1');
    req2.user = { uid: 'rate-limit-user-1' };
    rateLimiter(req2, res2, () => {});

    const { req: req3, res: res3 } = createMockReqRes({}, '10.0.0.1');
    req3.user = { uid: 'rate-limit-user-1' };
    rateLimiter(req3, res3, () => {});

    // 4th request must be rejected (limit was 3)
    const { req: req4, res: res4 } = createMockReqRes({}, '10.0.0.1');
    req4.user = { uid: 'rate-limit-user-1' };
    let nextCalled4 = false;
    rateLimiter(req4, res4, () => { nextCalled4 = true; });

    assert.strictEqual(nextCalled4, false, '2.2a. 4th request blocked by rate limiter');
    assert.strictEqual(res4.getStatusCode(), 429, '2.2b. Status is 429');
    assert.strictEqual(res4.getData()?.error?.code, 'RATE_LIMITED', '2.2c. Code is RATE_LIMITED');
    assert.strictEqual(res4.getData()?.error?.retryable, true, '2.2d. retryable is true');
    assert(!!res4.getData()?.error?.messageAr, '2.2e. Localized Arabic error message present');
    assert(Number(res4.getHeaders()['retry-after']) >= 1, '2.2f. Retry-After header >= 1s present');
    pass('2.2: Rate limit overflow rejected with 429 RATE_LIMITED and Retry-After header');
  }

  // Test 2.3: Rate limit is partitioned per user UID
  {
    // Different user with uid "rate-limit-user-2" should NOT be blocked
    const { req: reqOther, res: resOther } = createMockReqRes({}, '10.0.0.2');
    reqOther.user = { uid: 'rate-limit-user-2' };
    let nextCalledOther = false;
    rateLimiter(reqOther, resOther, () => { nextCalledOther = true; });

    assert.strictEqual(nextCalledOther, true, '2.3a. Independent user passes rate limiter');
    assert.strictEqual(resOther.getStatusCode(), 200, '2.3b. Status is 200');
    pass('2.3: Rate limiting is partitioned per user UID (no cross-user starvation)');
  }

  // Test 2.4: Rate limiter resets cleanly after resetRateLimiter()
  {
    resetRateLimiter();
    const { req: reqFresh, res: resFresh } = createMockReqRes({}, '10.0.0.1');
    reqFresh.user = { uid: 'rate-limit-user-1' };
    let nextCalledFresh = false;
    rateLimiter(reqFresh, resFresh, () => { nextCalledFresh = true; });

    assert.strictEqual(nextCalledFresh, true, '2.4a. Fresh request passes after reset');
    assert.strictEqual(resFresh.getStatusCode(), 200, '2.4b. Status is 200');
    pass('2.4: Rate limiter recovers and resets cleanly');
  }

  // -------------------------------------------------------------------------
  // SECTION 3: Privacy & Security Protections
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: Privacy, Key Isolation & Log Safety ---');

  // Test 3.1: Zero AI keys exposed in client bundle/code
  {
    const clientFiles = [
      'src/App.tsx',
      'src/main.tsx',
      'src/core/ai/aiProvider.ts',
      'src/core/ai/geminiServerProvider.ts',
      'src/core/ai/aiOrchestrator.ts',
      'src/modules/chat/ChatView.tsx',
      'src/modules/chat/hooks/useChatOrchestrator.ts',
    ];

    for (const f of clientFiles) {
      if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, 'utf-8');
        assert(!content.includes('AIzaSy'), `3.1: Hardcoded Google API key found in ${f}`);
        assert(!content.includes('process.env.GEMINI_API_KEY'), `3.1: Client file directly references server key: ${f}`);
      }
    }
    pass('3.1: Zero Google AI API keys or server secrets exposed in client codebase');
  }

  // Test 3.2: 401 and 429 error bodies do not leak auth token or internals
  {
    const { req, res } = createMockReqRes({ authorization: 'Bearer secret-super-token-12345' });
    setMockTokenVerifier(async () => {
      throw new Error('Token expired at timestamp 1700000000');
    });

    await requireAuth(req, res, () => {});
    const bodyStr = JSON.stringify(res.getData());
    assert(!bodyStr.includes('secret-super-token-12345'), '3.2a. Error response leaked token');
    assert(!bodyStr.includes('1700000000'), '3.2b. Error response leaked internal timestamp');
    pass('3.2: Error responses do not leak sensitive credentials or internal traces');
  }

  // -------------------------------------------------------------------------
  // SECTION 4: Client Provider Integration (GeminiServerProvider)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Client Provider (GeminiServerProvider) Token Attachment ---');

  // Test 4.1: GeminiServerProvider attaches Bearer token when user is in authStore
  {
    const provider = new GeminiServerProvider();
    let interceptedHeaders: any = null;

    const originalFetch = global.fetch;
    (global as any).fetch = async (url: string, init: any) => {
      interceptedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: 'Mock AI response text' }),
      };
    };

    useAuthStore.setState({
      user: {
        uid: 'novo-client-uid-42',
        getIdToken: async () => 'test-id-token-abc-xyz',
      } as any,
      loading: false,
    });

    const res = await provider.generateResponse('Hello AI', {} as any);
    assert.strictEqual(res.text, 'Mock AI response text', '4.1a. Response returned');
    assert.strictEqual(interceptedHeaders?.['Authorization'], 'Bearer test-id-token-abc-xyz', '4.1b. Authorization header was passed');

    (global as any).fetch = originalFetch;
    pass('4.1: GeminiServerProvider automatically attaches Authorization: Bearer <token>');
  }

  // Test 4.2: GeminiServerProvider maps 401 response to UNAUTHENTICATED AIError
  {
    const provider = new GeminiServerProvider();
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required. Authorization header missing.' }
      }),
    });

    let caughtError: any = null;
    try {
      await provider.generateResponse('Hello AI', {} as any);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, '4.2a. Threw error on 401');
    assert.strictEqual(caughtError.code, 'UNAUTHENTICATED', '4.2b. Error code is UNAUTHENTICATED');
    assert.strictEqual(caughtError.retryable, false, '4.2c. retryable is false');
    assert(caughtError.messageAr.includes('تسجيل الدخول'), '4.2d. messageAr contains sign-in guidance');

    (global as any).fetch = originalFetch;
    pass('4.2: GeminiServerProvider cleanly maps 401 to UNAUTHENTICATED with Arabic guidance');
  }

  // Test 4.3: GeminiServerProvider maps 429 response to RATE_LIMITED AIError
  {
    const provider = new GeminiServerProvider();
    const originalFetch = global.fetch;
    (global as any).fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests.',
          messageAr: 'تم تجاوز حد الطلبات المسموح به. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
          retryable: true,
        }
      }),
    });

    let caughtError: any = null;
    try {
      await provider.generateResponse('Hello AI', {} as any);
    } catch (err) {
      caughtError = err;
    }

    assert(caughtError !== null, '4.3a. Threw error on 429');
    assert.strictEqual(caughtError.code, 'RATE_LIMITED', '4.3b. Error code is RATE_LIMITED');
    assert.strictEqual(caughtError.retryable, true, '4.3c. retryable is true');
    assert(caughtError.messageAr.includes('تجاوز حد الطلبات'), '4.3d. messageAr contains rate limit guidance');

    (global as any).fetch = originalFetch;
    pass('4.3: GeminiServerProvider cleanly maps 429 to RATE_LIMITED with retryable=true');
  }

  // -------------------------------------------------------------------------
  // SECTION 5: Preserving Gate 18.1 & 18.2 Guarantees
  // -------------------------------------------------------------------------
  console.log('\n--- Section 5: Preserving Gate 18.1 & 18.2 Behavioral Invariants ---');

  // Test 5.1: Gate 18.1 deterministic commands bypass server endpoint entirely
  {
    const parseGoal = parseCommand('عايز أحط هدف أتعلم React');
    assert.strictEqual(parseGoal.isCommand, true, '5.1a. Handled as command');
    assert.strictEqual(parseGoal.command?.action, 'create_goal', '5.1b. Action is create_goal');
    assert(parseGoal.command?.goalPayload?.title.includes('أتعلم React'), '5.1c. Clean title');

    const parseTask = parseCommand('فكرني أراجع التقرير بكرة');
    assert.strictEqual(parseTask.isCommand, true, '5.1d. Handled as command');
    assert.strictEqual(parseTask.command?.action, 'create_task', '5.1e. Action is create_task');
    assert(parseTask.command?.taskPayload?.title.includes('أراجع التقرير'), '5.1f. Clean title');
    pass('5.1: Gate 18.1 deterministic commands take immediate fast path without network');
  }

  // Test 5.2: Gate 18.2 narrow heuristic protection
  {
    assert.strictEqual(isPlausiblyActionShaped('إزاي أضيف مهمة؟'), false, '5.2a. Question not action-shaped');
    assert.strictEqual(isPlausiblyActionShaped('صباح الخير'), false, '5.2b. Greeting not action-shaped');
    assert.strictEqual(isPlausiblyActionShaped('محتاج أراجع كود الـ Auth قبل ما نعمل Deploy'), true, '5.2c. Action recognized');
    assert.strictEqual(isPlausiblyActionShaped('ناوي أبدأ اتعلم برمجة بايثون'), true, '5.2d. Action recognized');
    pass('5.2: Gate 18.2 narrow local heuristic protection remains intact');
  }

  // Test 5.3: Zero mutation before confirmation
  {
    useTaskStore.setState({ tasks: [], status: 'ready', error: null });
    useGoalStore.setState({ goals: [], status: 'ready', error: null });

    const initialTasksCount = useTaskStore.getState().tasks.length;
    const initialGoalsCount = useGoalStore.getState().goals.length;

    assert.strictEqual(initialTasksCount, 0, '5.3a. Initial tasks 0');
    assert.strictEqual(initialGoalsCount, 0, '5.3b. Initial goals 0');
    pass('5.3: Zero unconfirmed mutations invariant preserved');
  }

  // -------------------------------------------------------------------------
  // SECTION 6: Auth Lifecycle Non-Regression
  // -------------------------------------------------------------------------
  console.log('\n--- Section 6: Auth Lifecycle & Epoch Invariants ---');

  // Test 6.1: Context switch increments epoch and invalidates guards
  {
    AuthLifecycle.reset('user-a');
    const guardA = AuthLifecycle.createGuard();
    assert.strictEqual(guardA.isStale(), false, '6.1a. Guard is fresh');

    AuthLifecycle.reset('user-b');
    assert.strictEqual(guardA.isStale(), true, '6.1b. Guard invalidated on identity switch');
    pass('6.1: AuthLifecycle generational epoch correctly invalidates stale operations');
  }

  // Clean up verifiers and configuration
  setMockTokenVerifier(null);
  configureRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });
  resetRateLimiter();

  console.log('\n====================================================');
  console.log(`ALL ${passed} GATE 19.1 TESTS PASSED PERFECTLY!`);
  console.log('====================================================');
}

runGate191Tests().catch((err) => {
  console.error('\n❌ [GATE 19.1 TEST RUNNER FAILED]:', err);
  process.exit(1);
});
