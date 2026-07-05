// CortexNative M0 — Marco C: triângulo WebGPU 100% comandado pelo JS.
// Este arquivo é compilado pra bytecode (.hbc) pelo hermesc no build e
// executado pelo Hermes dentro do host. A API `navigator.gpu` aqui é o shim
// nativo (webgpu_js.cpp) — a mesma superfície que o browser expõe, o que é
// exatamente o que o Three.js WebGPURenderer vai consumir nos próximos marcos.

const SHADER = `
@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(
    vec2f( 0.0,  0.62),
    vec2f(-0.62, -0.52),
    vec2f( 0.62, -0.52),
  );
  return vec4f(p[i], 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.55, 0.35, 0.95, 1.0);
}
`;

async function main() {
  print('[boot] pedindo adapter...');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const format = navigator.gpu.getPreferredCanvasFormat();
  print('[boot] device ok, format = ' + format);

  gpuContext.configure({ device, format });

  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  print('[boot] pipeline criado — WGSL compilado no backend D3D12');

  function frame(tMs) {
    const t = tMs / 1000;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpuContext.getCurrentTexture().createView(),
          clearValue: [
            0.04 + 0.03 * Math.sin(t),
            0.02,
            0.09 + 0.05 * Math.sin(t * 0.7),
            1,
          ],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  print('[boot] loop de frames entregue ao requestAnimationFrame');
}

main().catch(function (e) {
  print('[boot] ERRO: ' + e + (e && e.stack ? '\n' + e.stack : ''));
});
