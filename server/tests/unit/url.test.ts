import { describe, it, expect } from 'vitest';
import { normalizeUrl, isValidUrl } from '../../src/utils/url.js';

describe('normalizeUrl', () => {
  it('lowercases hostname', () => {
    expect(normalizeUrl('https://Example.COM/path')).toBe('https://example.com/path');
  });

  it('removes www prefix', () => {
    expect(normalizeUrl('https://www.example.com/path')).toBe('https://example.com/path');
  });

  it('removes trailing slash', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  it('preserves root slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('removes UTM tracking params', () => {
    expect(normalizeUrl('https://example.com/post?utm_source=twitter&utm_medium=social'))
      .toBe('https://example.com/post');
  });

  it('removes fbclid, gclid, and other trackers', () => {
    expect(normalizeUrl('https://example.com/page?fbclid=abc123&gclid=xyz'))
      .toBe('https://example.com/page');
  });

  it('preserves non-tracking query params', () => {
    expect(normalizeUrl('https://example.com/search?q=hello&page=2'))
      .toBe('https://example.com/search?page=2&q=hello');
  });

  it('sorts remaining query params', () => {
    expect(normalizeUrl('https://example.com/path?z=1&a=2'))
      .toBe('https://example.com/path?a=2&z=1');
  });

  it('removes hash fragment', () => {
    expect(normalizeUrl('https://example.com/page#section'))
      .toBe('https://example.com/page');
  });

  it('handles mixed case tracking params', () => {
    expect(normalizeUrl('https://example.com/page?UTM_SOURCE=foo'))
      .toBe('https://example.com/page');
  });

  it('preserves port numbers', () => {
    expect(normalizeUrl('https://example.com:8080/path'))
      .toBe('https://example.com:8080/path');
  });

  it('normalizes identical URLs to same value', () => {
    const url1 = normalizeUrl('https://WWW.Example.com/article/?utm_source=x#heading');
    const url2 = normalizeUrl('https://example.com/article');
    expect(url1).toBe(url2);
  });
});

describe('isValidUrl', () => {
  it('accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isValidUrl('https://example.com/path')).toBe(true);
  });

  it('rejects ftp URLs', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
  });

  it('rejects non-URL strings', () => {
    expect(isValidUrl('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });
});
