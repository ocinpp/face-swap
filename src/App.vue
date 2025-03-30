<template>
  <div class="min-h-screen bg-gray-100 flex flex-col items-center p-4">
    <h1 class="text-3xl font-bold mb-4">FaceSwap Live</h1>

    <!-- Photo Upload -->
    <div class="mb-4">
      <input
        type="file"
        accept="image/*"
        @change="uploadPhoto"
        class="file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-500 file:text-white hover:file:bg-blue-600"
      />
      <img
        v-if="photoSrc"
        :src="photoSrc"
        class="w-32 h-32 object-cover mt-2"
      />
    </div>

    <!-- Webcam Feed -->
    <div class="relative">
      <video ref="video" autoplay class="w-96 h-72 bg-black"></video>
      <canvas ref="canvas" class="absolute top-0 left-0 w-96 h-72"></canvas>
    </div>

    <!-- Controls -->
    <div class="mt-4 space-x-4">
      <button @click="startCamera" class="btn">Start Camera</button>
      <button @click="captureImage" class="btn">Capture</button>
    </div>

    <!-- Captured Output -->
    <img v-if="capturedSrc" :src="capturedSrc" class="w-96 h-72 mt-4" />
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";

// Refs
const video = ref(null);
const canvas = ref(null);
const photoSrc = ref(null);
const capturedSrc = ref(null);
let photoImage = new Image();
let faceMesh;

// Initialize MediaPipe FaceMesh
const initFaceMesh = () => {
  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults(onResults);
};

// Process face detection results
const onResults = (results) => {
  const ctx = canvas.value.getContext("2d");
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);

  // Draw the video feed
  ctx.drawImage(video.value, 0, 0, canvas.value.width, canvas.value.height);

  if (results.multiFaceLandmarks && photoSrc.value) {
    const landmarks = results.multiFaceLandmarks[0];
    swapFace(ctx, landmarks);
  }
};

// Basic face swapping logic
const swapFace = (ctx, landmarks) => {
  const faceWidth =
    Math.abs(landmarks[234].x - landmarks[454].x) * canvas.value.width;
  const faceHeight =
    Math.abs(landmarks[152].y - landmarks[10].y) * canvas.value.height;
  const faceX = landmarks[234].x * canvas.value.width;
  const faceY = landmarks[10].y * canvas.value.height;

  ctx.drawImage(photoImage, faceX, faceY, faceWidth, faceHeight);
};

// Upload photo
const uploadPhoto = (event) => {
  const file = event.target.files[0];
  if (file) {
    photoSrc.value = URL.createObjectURL(file);
    photoImage.src = photoSrc.value;
  }
};

// Start camera
const startCamera = async () => {
  const camera = new Camera(video.value, {
    onFrame: async () => {
      await faceMesh.send({ image: video.value });
    },
    width: 640,
    height: 480,
  });
  await camera.start();
};

// Capture the current canvas
const captureImage = () => {
  capturedSrc.value = canvas.value.toDataURL("image/png");
};

// Initialize on mount
onMounted(() => {
  initFaceMesh();
});
</script>

<style scoped>
@reference "tailwindcss";

.btn {
  @apply py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600;
}
</style>
