import * as TSL from "three/tsl";
import * as THREE from "three/webgpu";

import { OrbitControls } from "three/addons";
import tgpu from "typegpu";
import * as d from "typegpu/data";
import { boundComputeToNode, getNodeForBuffer } from "./tgpuThree.js";

// biome-ignore lint/style/useSingleVarDeclarator: <its fine>
let camera: THREE.PerspectiveCamera,
	scene: THREE.Scene,
	renderer: THREE.WebGPURenderer,
	controls: OrbitControls,
	computeNode: THREE.ComputeNode,
	positionStorage: THREE.StorageBufferNode,
	positionBufferAttribute: THREE.StorageBufferAttribute,
	iterationStorage: THREE.StorageBufferNode;
let iterationCounter = 0;

const root = await tgpu.init();
const device = root.device;

const initialCube = new THREE.BoxGeometry(1, 1, 1);
const positions = initialCube.getAttribute("position").array;

const initialData = [];
for (let i = 0; i < positions.length; i += 3) {
	initialData.push(
		d.vec4f(positions[i], positions[i + 1], positions[i + 2], 0),
	);
}

const positionBuffer = root
	.createBuffer(d.arrayOf(d.vec4f, 24), initialData)
	.$usage("storage", "vertex")
	.$name("tgpu_vertices");
const iterationBuffer = root
	.createBuffer(d.u32, 0)
	.$usage("storage")
	.$name("tgpu_iteration");

const computeBindGroupLayout = tgpu
	.bindGroupLayout({
		vertices: { storage: d.arrayOf(d.vec4f, 24), access: "mutable" },
		iteration: { storage: d.u32, access: "readonly" },
	})
	.$name("tgpu_layout");

const bindGroup = root.createBindGroup(computeBindGroupLayout, {
	vertices: positionBuffer,
	iteration: iterationBuffer,
});

const { vertices, iteration } = computeBindGroupLayout.bound;
const shader = tgpu["~unstable"]
	.computeFn([d.builtin.globalInvocationId], { workgroupSize: [24] })
	.does(
		`(@builtin(global_invocation_id) gid: vec3u) {
  let index = gid.x;
  let iterationF = f32(iteration);
  let sign = i32(index%16) * -1;
  let change = vec4f(0.0, sin(iterationF / 50f) / 300f * f32(sign), 0.0, 0.0);
  positionBound[index] = positionBound[index] + change;
}`,
	)
	.$uses({ positionBound: vertices, iteration });

const computePipeline = root["~unstable"]
	.withCompute(shader)
	.createPipeline()
	.$name("tgpu_pipeline")
	.with(computeBindGroupLayout, bindGroup);

await init();
const tgpuCompute = await boundComputeToNode(
	shader,
	[positionStorage, iterationStorage],
	renderer,
	device,
	root.unwrap(computePipeline),
	root.unwrap(bindGroup),
	root.unwrap(computeBindGroupLayout),
);

async function init() {
	renderer = new THREE.WebGPURenderer({
		antialias: true,
		device: root.device,
		// biome-ignore lint/suspicious/noExplicitAny: <I know it's there!>
	} as any);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setAnimationLoop(animate);
	renderer.setClearColor(new THREE.Color(0, 0, 0), 1);
	document.body.appendChild(renderer.domElement as HTMLCanvasElement);
	await renderer.init();

	camera = new THREE.PerspectiveCamera(
		80,
		window.innerWidth / window.innerHeight,
		0.1,
		100,
	);
	camera.translateX(5);
	camera.translateY(0);
	camera.translateZ(5);
	camera.lookAt(0, 0, 0);

	scene = new THREE.Scene();

	// ambient light
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
	scene.add(ambientLight);

	// directional light
	const directionalLight = new THREE.DirectionalLight("#ff9900", 1);
	directionalLight.translateX(20);
	directionalLight.translateY(2);
	directionalLight.translateZ(5);
	directionalLight.lookAt(0, 0, 0);
	scene.add(directionalLight);

	// box
	const texture = new THREE.TextureLoader().load("chill-bricks.jpg");
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set(2, 2);
	const geometry = new THREE.BoxGeometry(1, 1, 1);
	const material = new THREE.MeshStandardMaterial({
		map: texture,
	});

	// biome-ignore lint/suspicious/noExplicitAny: <For some reason it only accepts basic materials>
	const cube = new THREE.Mesh(geometry, material as any);
	scene.add(cube);

	// fog
	scene.fog = new THREE.Fog(0x0f0f0f, 1, 10);

	const { buffer: b, attribute: p } = getNodeForBuffer(
		positionBuffer,
		renderer,
	);
	const { buffer: b2, attribute: _ } = getNodeForBuffer(
		iterationBuffer,
		renderer,
	);
	positionBufferAttribute = p;
	positionStorage = b;
	iterationStorage = b2;

	const computePosition = TSL.Fn(() => {
		const timeMul = 0.01;
		const position = positionStorage.element(TSL.instanceIndex);
		const newPos = position
			// @ts-ignore: <Proxy magic>
			.add(
				TSL.vec4(
					TSL.oscSine(TSL.time.mul(0.1))
						.mul(timeMul)
						.sub(0.5 * timeMul),
					0,
					0,
					0,
				),
			)
			.toVar();
		// @ts-ignore: <Proxy magic>
		position.assign(newPos);
	});
	computeNode = computePosition().compute(24);

	geometry.setAttribute("position", positionBufferAttribute);

	controls = new OrbitControls(camera, renderer.domElement);
	controls.enableDamping = true;
	controls.minDistance = 2;
	controls.maxDistance = 10;

	window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);
}

async function animate() {
	controls.update();
	iterationCounter += 1;
	iterationBuffer.write(iterationCounter);

	// @ts-ignore: <Compute node extends Node>
	renderer.compute(computeNode);
	// @ts-ignore: <Compute node extends Node>
	renderer.compute(tgpuCompute.computeNode);

	await device.queue.onSubmittedWorkDone();

	renderer.render(scene, camera);
}
