import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());

const MODE_NAMES = {
  0: "POINTS",
  1: "LINES",
  2: "LINE_LOOP",
  3: "LINE_STRIP",
  4: "TRIANGLES",
  5: "TRIANGLE_STRIP",
  6: "TRIANGLE_FAN",
};

function parseArgs(argv) {
  const args = {
    file: "glb_model/f1_2025_mclaren_mcl39.glb",
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--file" && argv[index + 1]) {
      args.file = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function readGlbJson(buffer) {
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);

  if (magic !== 0x46546c67) {
    throw new Error("File is not a valid GLB.");
  }

  if (version !== 2) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }

  let offset = 12;
  while (offset < buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;

    if (chunkType === 0x4e4f534a) {
      const jsonText = buffer.subarray(chunkStart, chunkEnd).toString("utf-8").trim();
      return JSON.parse(jsonText);
    }

    offset = chunkEnd;
  }

  throw new Error("GLB does not contain a JSON chunk.");
}

function getPrimitiveVertexCount(gltf, primitive) {
  const positionAccessorIndex = primitive.attributes?.POSITION;
  if (positionAccessorIndex === undefined) {
    return 0;
  }

  return gltf.accessors?.[positionAccessorIndex]?.count ?? 0;
}

function getPrimitiveIndexCount(gltf, primitive) {
  if (primitive.indices === undefined) {
    return null;
  }

  return gltf.accessors?.[primitive.indices]?.count ?? null;
}

function getTriangleCount(gltf, primitive) {
  const mode = primitive.mode ?? 4;
  const indexCount = getPrimitiveIndexCount(gltf, primitive);
  const vertexCount = getPrimitiveVertexCount(gltf, primitive);
  const count = indexCount ?? vertexCount;

  if (mode === 4) {
    return Math.floor(count / 3);
  }

  if (mode === 5 || mode === 6) {
    return Math.max(0, count - 2);
  }

  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(root, args.file);
  const buffer = await readFile(filePath);
  const gltf = readGlbJson(buffer);
  const meshes = gltf.meshes ?? [];

  const meshSummaries = meshes.map((mesh, meshIndex) => {
    const primitives = mesh.primitives ?? [];
    const primitiveSummaries = primitives.map((primitive, primitiveIndex) => {
      const mode = primitive.mode ?? 4;
      const vertexCount = getPrimitiveVertexCount(gltf, primitive);
      const indexCount = getPrimitiveIndexCount(gltf, primitive);
      const triangleCount = getTriangleCount(gltf, primitive);

      return {
        meshIndex,
        primitiveIndex,
        mode,
        modeName: MODE_NAMES[mode] ?? `MODE_${mode}`,
        vertexCount,
        indexCount,
        triangleCount,
        materialIndex: primitive.material ?? null,
      };
    });

    return {
      meshIndex,
      name: mesh.name ?? `mesh-${meshIndex}`,
      primitiveCount: primitiveSummaries.length,
      triangleCount: primitiveSummaries.reduce((sum, primitive) => sum + primitive.triangleCount, 0),
      primitives: primitiveSummaries,
    };
  });

  const totalTriangles = meshSummaries.reduce((sum, mesh) => sum + mesh.triangleCount, 0);
  const totalPrimitives = meshSummaries.reduce((sum, mesh) => sum + mesh.primitiveCount, 0);
  const topMeshes = [...meshSummaries]
    .sort((left, right) => right.triangleCount - left.triangleCount)
    .slice(0, 12)
    .map((mesh) => ({
      meshIndex: mesh.meshIndex,
      name: mesh.name,
      triangleCount: mesh.triangleCount,
      primitiveCount: mesh.primitiveCount,
    }));

  const report = {
    file: path.relative(root, filePath),
    meshCount: meshSummaries.length,
    primitiveCount: totalPrimitives,
    totalTriangles,
    topMeshes,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
