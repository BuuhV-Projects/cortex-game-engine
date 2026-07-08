// Gera o MicrosoftGame.config + logos placeholder pra empacotar/registrar o host
// como app GDK Gaming.Desktop.x64 (M3, PRD-0004). Os logos são PNGs sólidos
// gerados na hora (dimensões exatas que o schema/tooling exige) — o jogo troca
// por arte real depois. Registro dev via `wdapp register` (loose layout).
//
// Uso: node native/scripts/gdk-package.mjs <dir> <appName> <exeName>
//   <dir> = pasta com o exe (ex.: dist-native ou native/build-gdk)
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// PNG RGBA sólido W×H (sem dependência externa). Node 22+ tem zlib.crc32.
function solidPng(w, h, [r, g, b, a] = [30, 32, 40, 255]) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const row = y * stride; // raw[row] = 0 (filtro none)
    for (let x = 0; x < w; x++) {
      const p = row + 1 + x * 4;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b; raw[p + 3] = a;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Dimensões EXATAS que o validador do GDK exige (makepkg validate).
const LOGOS = {
  'Square44x44Logo.png': [44, 44],
  'Square150x150Logo.png': [150, 150],
  'Square480x480Logo.png': [480, 480],
  'StoreLogo.png': [100, 100],
  'SplashScreenImage.png': [1920, 1080],
};

function configXml(appName, exeName) {
  const id = 'CortexNative.' + appName.replace(/[^A-Za-z0-9]/g, '');
  return `<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">
  <Identity Name="${id}" Publisher="CN=Cortex" Version="1.0.0.0" />
  <ExecutableList>
    <Executable Name="${exeName}" Id="Game" TargetDeviceFamily="PC" />
  </ExecutableList>
  <ShellVisuals
    DefaultDisplayName="${appName}"
    PublisherDisplayName="Cortex"
    StoreLogo="logos\\StoreLogo.png"
    Square150x150Logo="logos\\Square150x150Logo.png"
    Square44x44Logo="logos\\Square44x44Logo.png"
    Square480x480Logo="logos\\Square480x480Logo.png"
    SplashScreenImage="logos\\SplashScreenImage.png"
    BackgroundColor="#1e2028"
    ForegroundText="light"
    Description="${appName}" />
  <DependencyList>
    <KnownDependency Name="VC14" />
  </DependencyList>
</Game>
`;
}

/** Escreve MicrosoftGame.config + logos/ em `dir`. */
export function writeGdkPackageFiles(dir, appName, exeName) {
  const logosDir = path.join(dir, 'logos');
  fs.mkdirSync(logosDir, { recursive: true });
  for (const [name, [w, h]] of Object.entries(LOGOS)) {
    fs.writeFileSync(path.join(logosDir, name), solidPng(w, h));
  }
  fs.writeFileSync(path.join(dir, 'MicrosoftGame.config'), configXml(appName, exeName));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, appName, exeName] = process.argv.slice(2);
  if (!dir || !appName || !exeName) {
    console.error('uso: node gdk-package.mjs <dir> <appName> <exeName>');
    process.exit(1);
  }
  writeGdkPackageFiles(path.resolve(dir), appName, exeName);
  console.log(`[gdk-package] MicrosoftGame.config + logos em ${dir} (app=${appName}, exe=${exeName})`);
  console.log('[gdk-package] registrar (dev): wdapp register "<dir>\\MicrosoftGame.config"');
}
