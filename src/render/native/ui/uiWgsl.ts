/**
 * WGSL of the runtime UI (SPEC-0616): one instanced quad per record of `uiQuads.ts`. The formulas are
 * the ones the three 0.184 generates for the `RendererUiBackend` materials (R0 dump
 * `renderer-r0/wgsl/<point>/wgsl-0001` box, `wgsl-0002` text): same operations, same order.
 *
 * Group 0: the view (projection, view matrix, debug tint). Group 1: sampler + texture of the batch
 * (boxes bind a 1×1 white texture: the sample is always taken, in uniform control flow).
 */
import { QUAD_BORDER_AT, QUAD_BOTTOM_AT, QUAD_MATRIX_AT, QUAD_MISC_AT, QUAD_SHAPE_AT, QUAD_TOP_AT, QUAD_UV_AT, UI_QUAD_BYTES } from './uiQuads.js';

/** Floats of the view block: projection + view matrix + tint `vec4`. */
export const UI_VIEW_FLOATS = 16 + 16 + 4;
/** Where the debug tint (`?nativeUiTint=1`) sits in the view block. */
export const UI_VIEW_TINT_AT = 32;
/** Vertices of a quad (two triangles of `PlaneGeometry(1, 1)`). */
export const UI_QUAD_VERTICES = 6;

const FLOAT_BYTES = 4;
const VEC4_FLOATS = 4;

/** Per-instance vertex layout: the record as 10 `float32x4` attributes, locations 0..9. */
export function uiInstanceLayout(): { arrayStride: number; stepMode: 'instance'; attributes: Array<{ shaderLocation: number; offset: number; format: string }> } {
  const starts = [QUAD_MATRIX_AT, QUAD_MATRIX_AT + 4, QUAD_MATRIX_AT + 8, QUAD_MATRIX_AT + 12, QUAD_SHAPE_AT, QUAD_TOP_AT, QUAD_BOTTOM_AT, QUAD_BORDER_AT, QUAD_MISC_AT, QUAD_UV_AT];
  return {
    arrayStride: UI_QUAD_BYTES,
    stepMode: 'instance',
    attributes: starts.map((at, location) => ({ shaderLocation: location, offset: at * FLOAT_BYTES, format: `float32x${VEC4_FLOATS}` })),
  };
}

export const UI_WGSL = /* wgsl */ `
diagnostic(off, derivative_uniformity);

struct View {
  projection : mat4x4<f32>,
  view : mat4x4<f32>,
  tint : vec4<f32>,
};
@group(0) @binding(0) var<uniform> uView : View;
@group(1) @binding(0) var uSampler : sampler;
@group(1) @binding(1) var uTexture : texture_2d<f32>;

struct Quad {
  @location(0) m0 : vec4<f32>,
  @location(1) m1 : vec4<f32>,
  @location(2) m2 : vec4<f32>,
  @location(3) m3 : vec4<f32>,
  @location(4) shape : vec4<f32>,
  @location(5) top : vec4<f32>,
  @location(6) bottom : vec4<f32>,
  @location(7) border : vec4<f32>,
  @location(8) misc : vec4<f32>,
  @location(9) uvXform : vec4<f32>,
};

struct Varyings {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) @interpolate(flat) shape : vec4<f32>,
  @location(2) @interpolate(flat) top : vec4<f32>,
  @location(3) @interpolate(flat) bottom : vec4<f32>,
  @location(4) @interpolate(flat) border : vec4<f32>,
  @location(5) @interpolate(flat) misc : vec4<f32>,
  @location(6) @interpolate(flat) uvXform : vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vertex : u32, q : Quad) -> Varyings {
  // PlaneGeometry(1, 1): vertices (-0.5, 0.5) (0.5, 0.5) (-0.5, -0.5) (0.5, -0.5), index (0, 2, 1) (2, 3, 1).
  var corners = array<u32, 6>(0u, 2u, 1u, 2u, 3u, 1u);
  let corner = corners[vertex];
  let ix = f32(corner % 2u);
  let iy = f32(corner / 2u);
  let position = vec3<f32>(ix - 0.5, 0.5 - iy, 0.0);
  let model = mat4x4<f32>(q.m0, q.m1, q.m2, q.m3);
  let modelView = uView.view * model;
  let positionView = (modelView * vec4<f32>(position, 1.0)).xyz;
  var out : Varyings;
  out.clip = uView.projection * vec4<f32>(positionView, 1.0);
  out.uv = vec2<f32>(ix, 1.0 - iy);
  out.shape = q.shape;
  out.top = q.top;
  out.bottom = q.bottom;
  out.border = q.border;
  out.misc = q.misc;
  out.uvXform = q.uvXform;
  return out;
}

fn roundedRect(uv : vec2<f32>, size : vec2<f32>, radius : f32) -> f32 {
  let q = abs((uv - vec2<f32>(0.5, 0.5)) * size) - ((size * vec2<f32>(0.5)) - vec2<f32>(radius, radius));
  return (length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0)) - radius;
}

@fragment
fn fs(v : Varyings) -> @location(0) vec4<f32> {
  let sampled = textureSample(uTexture, uSampler, v.uv * v.uvXform.xy + v.uvXform.zw);
  let kind = u32(v.misc.w);
  let dist = roundedRect(v.uv, v.shape.xy, v.shape.z);
  var color : vec4<f32>;
  if (kind == 0u) {
    let factor = mix(1.0 - v.uv.y, v.uv.x, v.misc.x);
    let borderWidth = v.shape.w;
    let borderMask = smoothstep((-borderWidth) - 0.75, (-borderWidth) + 0.75, dist) * min(borderWidth, 1.0);
    color = vec4<f32>(
      mix(mix(v.top.xyz, v.bottom.xyz, factor), v.border.xyz, borderMask),
      (smoothstep(0.75, -0.75, dist) * mix(mix(v.top.w, v.bottom.w, factor), v.border.w, borderMask)) * v.misc.y,
    );
  } else if (kind == 1u) {
    color = vec4<f32>(v.top.xyz, 1.0) * sampled;
  } else {
    color = vec4<f32>(sampled.x, sampled.y, sampled.z, (sampled.w * smoothstep(0.75, -0.75, dist)) * v.misc.y);
  }
  color.w = color.w * v.misc.z;
  return max(color, vec4<f32>(0.0)) + uView.tint;
}
`;
