/**
 * Save assinado + ofuscado (ADR-0107): round-trip, detecção de adulteração,
 * chave errada e rejeição de formato legado. A corretude do HMAC em si está em
 * hmacSha256.test.ts (vetores NIST/RFC).
 */
import { describe, it, expect } from 'vitest';
import { encodeSignedSave, decodeSignedSave } from '../../src/io/signedSave.js';

const SECRET = 'cute-obstacle-rush/v1/9f3ac2';
const payload = JSON.stringify({ version: 1, completed: ['fase-1', 'fase-2'] });

describe('signedSave', () => {
  it('round-trip: decode(encode(x)) === x', () => {
    const token = encodeSignedSave(payload, SECRET);
    expect(decodeSignedSave(token, SECRET)).toBe(payload);
  });

  it('o token NÃO parece JSON nem expõe o conteúdo em claro', () => {
    const token = encodeSignedSave(payload, SECRET);
    expect(token.startsWith('CXS1.')).toBe(true);
    expect(token).not.toContain('completed');
    expect(token).not.toContain('fase-1');
  });

  it('adulterar os DADOS invalida (retorna null)', () => {
    const token = encodeSignedSave(payload, SECRET);
    const [magic, data, sig] = token.split('.');
    // vira um bit do 1º char do payload ofuscado
    const flipped = (data![0] === 'A' ? 'B' : 'A') + data!.slice(1);
    expect(decodeSignedSave(`${magic}.${flipped}.${sig}`, SECRET)).toBeNull();
  });

  it('adulterar a ASSINATURA invalida (retorna null)', () => {
    const token = encodeSignedSave(payload, SECRET);
    const [magic, data, sig] = token.split('.');
    const flipped = (sig![0] === 'A' ? 'B' : 'A') + sig!.slice(1);
    expect(decodeSignedSave(`${magic}.${data}.${flipped}`, SECRET)).toBeNull();
  });

  it('chave errada não decodifica (retorna null)', () => {
    const token = encodeSignedSave(payload, SECRET);
    expect(decodeSignedSave(token, 'chave-errada')).toBeNull();
  });

  it('formato legado / lixo → null (sem lançar)', () => {
    expect(decodeSignedSave('{"version":1,"completed":[]}', SECRET)).toBeNull(); // JSON puro antigo
    expect(decodeSignedSave('', SECRET)).toBeNull();
    expect(decodeSignedSave('CXS1.só-uma-parte', SECRET)).toBeNull();
    expect(decodeSignedSave('XXXX.aaa.bbb', SECRET)).toBeNull(); // magic errado
  });

  it('payload vazio e com caracteres não-ASCII sobrevive', () => {
    expect(decodeSignedSave(encodeSignedSave('', SECRET), SECRET)).toBe('');
    const uni = JSON.stringify({ msg: 'fase concluída ✓ ção' });
    expect(decodeSignedSave(encodeSignedSave(uni, SECRET), SECRET)).toBe(uni);
  });

  it('tokens de payloads diferentes diferem (keystream não é fixo p/ conteúdo)', () => {
    const a = encodeSignedSave('{"a":1}', SECRET);
    const b = encodeSignedSave('{"a":2}', SECRET);
    expect(a).not.toBe(b);
  });
});
