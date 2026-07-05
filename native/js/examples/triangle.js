// CortexNative M0 — Marco D: triângulo girando via vertex buffer + uniform.
// Compilado pra .hbc pelo hermesc no build e executado pelo Hermes no host.
// `navigator.gpu` é o shim nativo (src/webgpu/) — mesma superfície do
// browser, a que o Three.js WebGPURenderer consome no Marco E.

const SHADER = `
struct Uniforms { angle : f32 };
@group(0) @binding(0) var<uniform> u : Uniforms;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) color : vec3f,
};

@vertex
fn vs(@location(0) pos : vec2f, @location(1) color : vec3f) -> VSOut {
  let c = cos(u.angle);
  let s = sin(u.angle);
  let rotated = vec2f(pos.x * c - pos.y * s, pos.x * s + pos.y * c);
  var out : VSOut;
  out.pos = vec4f(rotated, 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
`;

// x, y, r, g, b — um vértice por linha
const VERTICES = new Float32Array([
   0.0,  0.62,  0.95, 0.35, 0.55,
  -0.62, -0.52, 0.35, 0.55, 0.95,
   0.62, -0.52, 0.55, 0.95, 0.35,
]);

async function main() {
  print('[boot] pedindo adapter...');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  print('[boot] device ok, format = ' + format);

  gpuContext.configure({ device, format });

  const vertexBuffer = device.createBuffer({
    size: VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, VERTICES);

  const uniformBuffer = device.createBuffer({
    size: 16, // 1 float + padding (alinhamento de uniform)
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 5 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 2 * 4, format: 'float32x3' },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  print('[boot] pipeline + vertex/uniform buffers + bind group prontos');

  const angleData = new Float32Array(1);
  function frame(tMs) {
    angleData[0] = (tMs / 1000) * 0.9;
    device.queue.writeBuffer(uniformBuffer, 0, angleData);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          clearValue: [0.04, 0.02, 0.09, 1],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  print('[boot] triângulo girando entregue ao requestAnimationFrame');
}

main().catch(function (e) {
  print('[boot] ERRO: ' + e + (e && e.stack ? '\n' + e.stack : ''));
});
