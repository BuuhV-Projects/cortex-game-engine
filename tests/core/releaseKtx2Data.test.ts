/**
 * SPEC-0286: os dados em CPU dos mips KTX2 nativos somem só depois que TODAS as
 * texturas que compartilham os mips (clones por material do GLTFLoader) sobem.
 */
import { describe, it, expect } from 'vitest';
import {
  BoxGeometry, CompressedTexture, Group, Mesh, MeshStandardMaterial, RGBA_BPTC_Format,
} from 'three';
import { NATIVE_KTX2_FLAG, releaseKtx2DataAfterUpload } from '../../src/core/loadKtx2.js';

const MIP_BYTES = 16;

function nativeTexture(): CompressedTexture {
  const mipmaps = [{ data: new Uint8Array(MIP_BYTES), width: 4, height: 4 }];
  const texture = new CompressedTexture(mipmaps as unknown as ImageData[], 4, 4, RGBA_BPTC_Format);
  texture.userData[NATIVE_KTX2_FLAG] = true;
  return texture;
}

const mipData = (texture: CompressedTexture) =>
  (texture.mipmaps as unknown as { data: Uint8Array | null }[])[0]!.data;

describe('releaseKtx2DataAfterUpload', () => {
  it('libera os mips só quando o último clone sobe', () => {
    const source = nativeTexture();
    const first = source.clone();
    const second = source.clone();
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: first })));
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ emissiveMap: second })));

    releaseKtx2DataAfterUpload(root);
    first.onUpdate!(first);
    expect(mipData(second)).not.toBeNull();
    second.onUpdate!(second);
    expect(mipData(first)).toBeNull();
    expect(mipData(second)).toBeNull();
  });

  it('mantém o onUpdate anterior e ignora texturas que não vieram do host', () => {
    const native = nativeTexture();
    const browser = nativeTexture();
    delete browser.userData[NATIVE_KTX2_FLAG];
    let previousCalls = 0;
    native.onUpdate = () => { previousCalls++; };
    const root = new Mesh(new BoxGeometry(), [
      new MeshStandardMaterial({ map: native }), new MeshStandardMaterial({ map: browser }),
    ]);

    releaseKtx2DataAfterUpload(root);
    native.onUpdate!(native);
    expect(previousCalls).toBe(1);
    expect(mipData(native)).toBeNull();
    expect(browser.onUpdate).toBeFalsy();
    expect(mipData(browser)).not.toBeNull();
  });
});
