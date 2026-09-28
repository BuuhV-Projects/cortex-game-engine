import { Box3, DataTexture, LinearFilter, Matrix4, Mesh, RGBAFormat, Vector3, Vector4, type Object3D } from 'three';

const MAX_TEXTURE_SIZE = 1024;
const TARGET_TEXEL_SIZE = .2;
const COLOR_CHANNELS = 4;
const MAX_CHANNEL_VALUE = 255;
const TRIANGLE_VERTICES = 3;
const MIN_SEGMENT_LENGTH_SQUARED = 1e-10;

type Segment = [number, number, number, number];

/** Extrai somente o contorno no nível médio: objetos submersos não geram espuma. */
function collectSegments(root: Object3D, height: number): Segment[] {
  const segments: Segment[] = [];
  const bounds = new Box3();
  const vertices = [new Vector3(), new Vector3(), new Vector3()];
  const intersections = [new Vector3(), new Vector3(), new Vector3()];
  const instanceMatrix = new Matrix4();
  const worldMatrix = new Matrix4();
  root.updateMatrixWorld(true);

  function intersectMesh(mesh: Mesh, matrix: Matrix4): void {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position');
    if (!positions) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    bounds.copy(geometry.boundingBox!).applyMatrix4(matrix);
    if (bounds.min.y >= height || bounds.max.y <= height) return;
    const indices = geometry.index;
    const count = indices?.count ?? positions.count;
    const start = geometry.drawRange.start;
    const end = Math.min(count, start + geometry.drawRange.count);
    for (let index = start; index + TRIANGLE_VERTICES <= end; index += TRIANGLE_VERTICES) {
      for (let corner = 0; corner < TRIANGLE_VERTICES; corner++) {
        const vertexIndex = indices ? indices.getX(index + corner) : index + corner;
        vertices[corner].fromBufferAttribute(positions, vertexIndex).applyMatrix4(matrix);
      }
      let crossingCount = 0;
      for (let edge = 0; edge < TRIANGLE_VERTICES; edge++) {
        const from = vertices[edge];
        const to = vertices[(edge + 1) % TRIANGLE_VERTICES];
        if ((from.y < height) === (to.y < height)) continue;
        const fraction = (height - from.y) / (to.y - from.y);
        intersections[crossingCount++].copy(from).lerp(to, fraction);
      }
      if (crossingCount !== 2) continue;
      const from = intersections[0];
      const to = intersections[1];
      if (from.distanceToSquared(to) <= MIN_SEGMENT_LENGTH_SQUARED) continue;
      segments.push([from.x, from.z, to.x, to.z]);
    }
  }

  root.traverseVisible(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || mesh.userData.cortexWater || 'isSkinnedMesh' in mesh) return;
    if ('isInstancedMesh' in mesh) {
      const instances = mesh as import('three').InstancedMesh;
      for (let index = 0; index < instances.count; index++) {
        instances.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
        intersectMesh(mesh, worldMatrix);
      }
    } else {
      intersectMesh(mesh, mesh.matrixWorld);
    }
  });
  return segments;
}

/** Máscara estática em coordenadas mundiais, sem passe extra de renderização. */
export function createShorelineMask(root: Object3D, height: number, width: number): {
  texture: DataTexture;
  bounds: Vector4;
} {
  const segments = collectSegments(root, height);
  if (segments.length === 0) {
    return { texture: createTexture(new Uint8Array(COLOR_CHANNELS), 1, 1), bounds: new Vector4(0, 0, 1, 1) };
  }
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [fromX, fromZ, toX, toZ] of segments) {
    minX = Math.min(minX, fromX, toX);
    minZ = Math.min(minZ, fromZ, toZ);
    maxX = Math.max(maxX, fromX, toX);
    maxZ = Math.max(maxZ, fromZ, toZ);
  }
  // A borda zerada impede o clamp da textura de espalhar espuma para o mar aberto.
  const padding = width * 2;
  minX -= padding;
  minZ -= padding;
  maxX += padding;
  maxZ += padding;
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const texelSize = Math.max(TARGET_TEXEL_SIZE, sizeX / MAX_TEXTURE_SIZE, sizeZ / MAX_TEXTURE_SIZE);
  const columns = Math.min(MAX_TEXTURE_SIZE, Math.max(2, Math.ceil(sizeX / texelSize)));
  const rows = Math.min(MAX_TEXTURE_SIZE, Math.max(2, Math.ceil(sizeZ / texelSize)));
  const stepX = sizeX / columns;
  const stepZ = sizeZ / rows;
  const pixels = new Uint8Array(columns * rows * COLOR_CHANNELS);
  for (const [fromX, fromZ, toX, toZ] of segments) {
    const firstColumn = Math.max(0, Math.floor((Math.min(fromX, toX) - width - minX) / stepX));
    const lastColumn = Math.min(columns - 1, Math.ceil((Math.max(fromX, toX) + width - minX) / stepX));
    const firstRow = Math.max(0, Math.floor((Math.min(fromZ, toZ) - width - minZ) / stepZ));
    const lastRow = Math.min(rows - 1, Math.ceil((Math.max(fromZ, toZ) + width - minZ) / stepZ));
    const directionX = toX - fromX;
    const directionZ = toZ - fromZ;
    const lengthSquared = directionX * directionX + directionZ * directionZ;
    for (let row = firstRow; row <= lastRow; row++) {
      const z = minZ + (row + .5) * stepZ;
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x = minX + (column + .5) * stepX;
        const projection = ((x - fromX) * directionX + (z - fromZ) * directionZ) / lengthSquared;
        const fraction = Math.max(0, Math.min(1, projection));
        const distance = Math.hypot(x - fromX - fraction * directionX, z - fromZ - fraction * directionZ);
        const intensity = Math.max(0, 1 - distance / width);
        const offset = (row * columns + column) * COLOR_CHANNELS;
        pixels[offset] = Math.max(pixels[offset], Math.round(intensity * MAX_CHANNEL_VALUE));
      }
    }
  }
  return { texture: createTexture(pixels, columns, rows), bounds: new Vector4(minX, minZ, sizeX, sizeZ) };
}

function createTexture(pixels: Uint8Array, width: number, height: number): DataTexture {
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
