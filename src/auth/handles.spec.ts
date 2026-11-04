import { parkedHandle } from './handles';

describe('parkedHandle', () => {
  it('moves a stale handle aside with the old GitHub id', () => {
    expect(parkedHandle('ada', '583231')).toBe('ada-gh583231');
  });

  it('stays within the 39 character GitHub handle limit', () => {
    const parked = parkedHandle('a'.repeat(39), '1234567890');
    expect(parked).toHaveLength(39);
    expect(parked.endsWith('-gh1234567890')).toBe(true);
    expect(parked).toMatch(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/);
  });
});
