import { clientTracker } from './client-throttler.guard';

describe('clientTracker', () => {
  it('limits signed in requests per device token, not per shared proxy address', () => {
    const first = clientTracker({
      headers: {
        authorization: 'Bearer tka_first',
        'cf-connecting-ip': '1.1.1.1',
      },
      ip: '172.70.0.1',
    });
    const second = clientTracker({
      headers: {
        authorization: 'Bearer tka_second',
        'cf-connecting-ip': '1.1.1.1',
      },
      ip: '172.70.0.1',
    });
    expect(first).toMatch(/^token:[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain('tka_first');
  });

  it('limits anonymous requests by the real client address behind Cloudflare', () => {
    expect(
      clientTracker({
        headers: { 'cf-connecting-ip': ' 203.0.113.9 ' },
        ip: '172.70.0.1',
      }),
    ).toBe('ip:203.0.113.9');
    expect(clientTracker({ headers: {}, ip: '198.51.100.4' })).toBe(
      'ip:198.51.100.4',
    );
    expect(clientTracker({ headers: { authorization: 'Basic abc' } })).toBe(
      'ip:unknown',
    );
  });
});
