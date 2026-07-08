/**
 * Vetores conhecidos de SHA-256 (NIST) e HMAC-SHA256 (RFC 4231) — garante que a
 * implementação JS pura (src/io/hmacSha256.ts) está CORRETA, não só
 * auto-consistente. Sem isto, um bug consistente passaria num round-trip.
 */
import { describe, it, expect } from 'vitest';
import { sha256, hmacSha256, bytesToHex, bytesEqual } from '../../src/io/hmacSha256.js';

const ascii = (s: string): Uint8Array => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const hexBytes = (h: string): Uint8Array =>
  new Uint8Array((h.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

describe('sha256 (vetores NIST)', () => {
  it('"" (vazio)', () => {
    expect(bytesToHex(sha256(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('"abc"', () => {
    expect(bytesToHex(sha256(ascii('abc')))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('mensagem de 448 bits (dois blocos)', () => {
    const msg = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(bytesToHex(sha256(ascii(msg)))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
  it('1 milhão de "a" (exercita muitos blocos)', () => {
    expect(bytesToHex(sha256(new Uint8Array(1_000_000).fill(0x61)))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });
});

describe('hmacSha256 (vetores RFC 4231)', () => {
  it('caso 1: key=0x0b×20, data="Hi There"', () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(bytesToHex(hmacSha256(key, ascii('Hi There')))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });
  it('caso 2: key="Jefe", data="what do ya want for nothing?"', () => {
    expect(bytesToHex(hmacSha256(ascii('Jefe'), ascii('what do ya want for nothing?')))).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });
  it('caso 4: key=0x01..0x19 (25 bytes), data=0xcd×50', () => {
    const key = hexBytes('0102030405060708090a0b0c0d0e0f10111213141516171819');
    const data = new Uint8Array(50).fill(0xcd);
    expect(bytesToHex(hmacSha256(key, data))).toBe(
      '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
    );
  });
  it('caso 6: chave MAIOR que o bloco (131 bytes) é hasheada primeiro', () => {
    const key = new Uint8Array(131).fill(0xaa);
    const data = ascii('Test Using Larger Than Block-Size Key - Hash Key First');
    expect(bytesToHex(hmacSha256(key, data))).toBe(
      '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
    );
  });
});

describe('bytesEqual (tempo constante)', () => {
  it('true só para conteúdo idêntico', () => {
    expect(bytesEqual(ascii('abc'), ascii('abc'))).toBe(true);
    expect(bytesEqual(ascii('abc'), ascii('abd'))).toBe(false);
    expect(bytesEqual(ascii('abc'), ascii('ab'))).toBe(false);
  });
});
