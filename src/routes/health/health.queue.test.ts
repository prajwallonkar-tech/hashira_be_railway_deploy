import request from 'supertest';
import { app, setAnchorQueue } from '../../app';
import type { Queue } from 'bullmq';
import type { AnchorEventJobData } from '../../queues/anchor.queue';

function makeQueue(counts: Record<string, number>): Queue<AnchorEventJobData> {
  return {
    getJobCounts: jest.fn().mockResolvedValue(counts),
  } as unknown as Queue<AnchorEventJobData>;
}

afterEach(() => {
  // Reset queue singleton so tests are isolated
  setAnchorQueue(null);
});

describe('GET /health/queue', () => {
  it('returns 503 with status unavailable when queue is not initialised', async () => {
    const res = await request(app).get('/health/queue');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'unavailable' });
  });

  it('returns 200 with status ok when queue is initialised', async () => {
    setAnchorQueue(
      makeQueue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
    );

    const res = await request(app).get('/health/queue');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('returns queue job counts in the response body', async () => {
    const counts = {
      waiting: 3,
      active: 1,
      completed: 42,
      failed: 2,
      delayed: 0,
    };
    setAnchorQueue(makeQueue(counts));

    const res = await request(app).get('/health/queue');

    const body = res.body as { status: string; queue: typeof counts };
    expect(body.queue).toMatchObject(counts);
  });

  it('does not require authentication', async () => {
    setAnchorQueue(
      makeQueue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
    );

    // No Authorization header or cookie
    const res = await request(app).get('/health/queue');

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
