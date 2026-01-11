> [!IMPORTANT]
> This proof-of-concept led to the creation of [@typegpu/three](https://typegpu.com/ecosystem/typegpu-three/), which now lives in the [main TypeGPU repository](https://github.com/software-mansion/typegpu).

# Integrating TypeGPU with Three.js

This example demonstrates how to share resources between TypeGPU and Three.js. It renders a textured cube with Three.js and then updates its mesh using a combination of TSL and TypeGPU shaders. In this setup:

- The **TSL shader** manages the cube’s position.
- The **TypeGPU compute shader** packaged as a ComputeNode modifies the mesh.
- Both shaders work with a shared **StorageBufferAttribute** that uses a TypeGPU buffer as its host.

## Running Locally

To try out the example locally, install the dependencies with your preferred package manager and then run the development script:

```bash
pnpm install
pnpm dev
```

If you’d like to build and preview the project, use:

```bash
pnpm install
pnpm build
pnpm preview
```
