<template>
  <div class="min-h-screen bg-gray-100 p-4 md:p-8">
    <div
      class="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6"
    >
      <h1 class="text-3xl font-bold text-center mb-6 text-gray-800">
        Face Emoji Swapper
      </h1>

      <!-- Step 1: Upload Image -->
      <div class="mb-6">
        <h2 class="text-xl font-semibold mb-3 text-gray-700">
          1. Upload an image with faces (works best for portraits!)
        </h2>
        <div
          class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:bg-gray-50 transition"
          @click="triggerFileInput"
          @dragover.prevent
          @drop.prevent="handleFileDrop"
        >
          <input
            type="file"
            ref="fileInput"
            accept="image/*"
            class="hidden"
            @change="handleFileUpload"
          />
          <div v-if="!sourceImage">
            <Icon icon="upload" class="mx-auto h-12 w-12 text-gray-400" />
            <p class="mt-2 text-gray-600">Click to upload or drag and drop</p>
            <p class="text-sm text-gray-500">PNG, JPG, JPEG (max 5MB)</p>
          </div>
          <div v-else class="flex justify-center">
            <img
              :src="sourceImage"
              alt="Uploaded image"
              class="max-h-64 rounded-lg"
            />
          </div>
        </div>
      </div>

      <!-- Step 2: Select Emoji -->
      <div
        class="mb-6"
        :class="{ 'opacity-50 pointer-events-none': !sourceImage }"
      >
        <h2 class="text-xl font-semibold mb-3 text-gray-700">
          2. Choose an emoji to replace faces
        </h2>
        <div class="grid grid-cols-4 md:grid-cols-8 gap-3">
          <button
            v-for="(emoji, index) in emojis"
            :key="index"
            @click="selectedEmoji = emoji"
            class="text-4xl p-2 rounded-lg hover:bg-gray-100 transition"
            :class="{
              'bg-blue-100 ring-2 ring-blue-500': selectedEmoji === emoji,
            }"
          >
            {{ emoji }}
          </button>
        </div>
      </div>

      <!-- Step 3: Transform Button -->
      <div class="mb-6">
        <h2 class="text-xl font-semibold mb-3 text-gray-700">
          3. Transform Image
        </h2>
        <div class="text-center">
          <button
            @click="transformImage"
            class="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
            :disabled="!sourceImage || !selectedEmoji || isProcessing"
            :class="{
              'opacity-50 cursor-not-allowed':
                !sourceImage || !selectedEmoji || isProcessing,
            }"
          >
            <span v-if="isProcessing" class="flex items-center justify-center">
              <Icon icon="loader" class="animate-spin mr-2" />
              Processing...
            </span>
            <span v-else>Transform Image</span>
          </button>
        </div>
      </div>

      <!-- Step 4: Result Preview -->
      <div v-if="resultImage" class="mb-6">
        <h2 class="text-xl font-semibold mb-3 text-gray-700">4. Result</h2>

        <!-- Emoji Size Slider -->
        <div class="mb-4">
          <label
            for="emoji-size"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Emoji Size: {{ emojiSizePercent }}%
          </label>
          <input
            id="emoji-size"
            type="range"
            min="50"
            max="150"
            step="5"
            v-model="emojiSizePercent"
            @change="applyEmojiSize"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Smaller</span>
            <span>Larger</span>
          </div>
        </div>

        <!-- Background Transparency Slider -->
        <div class="mb-4">
          <label
            for="bg-transparency"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Background Transparency: {{ backgroundTransparency }}%
          </label>
          <input
            id="bg-transparency"
            type="range"
            min="0"
            max="100"
            step="5"
            v-model="backgroundTransparency"
            @change="applyEmojiSize"
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>Transparent</span>
            <span>Opaque</span>
          </div>
        </div>

        <div class="flex justify-center">
          <img
            :src="resultImage"
            alt="Transformed image"
            class="max-h-96 rounded-lg"
          />
        </div>
        <div class="mt-4 text-center">
          <a
            :href="resultImage"
            download="face-emoji-swap.png"
            class="px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition"
          >
            Download Image
          </a>
        </div>
      </div>

      <!-- Loading overlay -->
      <div
        v-if="isLoading"
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      >
        <div class="bg-white p-6 rounded-lg shadow-lg text-center">
          <Icon
            icon="loader"
            class="animate-spin h-12 w-12 mx-auto text-blue-600"
          />
          <p class="mt-4 text-lg font-medium">Loading MediaPipe...</p>
          <p class="text-gray-500">This may take a few seconds</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { Icon } from "@iconify/vue";

// State variables
const fileInput = ref(null);
const sourceImage = ref(null);
const resultImage = ref(null);
const selectedEmoji = ref(null);
const isProcessing = ref(false);
const isLoading = ref(true);
const emojiSizePercent = ref(100);
const backgroundTransparency = ref(0); // Default to 0% opacity (100% transparency)
const detectedFaces = ref([]);

// Available emojis
const emojis = ["😀", "😎", "🤡", "👽", "🐶", "🐱", "🐭", "🦊"];

// MediaPipe face detection model
let faceDetection = null;

// Initialize MediaPipe
onMounted(async () => {
  try {
    // Import MediaPipe dynamically
    const vision = await import("@mediapipe/tasks-vision");

    // Initialize the face detector
    const { FaceDetector, FilesetResolver } = vision;

    // Load the face detection model
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    faceDetection = await FaceDetector.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
    });

    isLoading.value = false;
  } catch (error) {
    console.error("Error initializing MediaPipe:", error);
    alert(
      "Failed to load face detection. Please try again or check console for errors."
    );
    isLoading.value = false;
  }
});

// Trigger file input click
const triggerFileInput = () => {
  fileInput.value.click();
};

// Handle file upload
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  if (file) {
    processUploadedFile(file);
  }
};

// Handle file drop
const handleFileDrop = (event) => {
  const file = event.dataTransfer.files[0];
  if (file) {
    processUploadedFile(file);
  }
};

// Process the uploaded file
const processUploadedFile = (file) => {
  if (file.size > 5 * 1024 * 1024) {
    alert("File size exceeds 5MB limit");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    sourceImage.value = e.target.result;
    resultImage.value = null; // Reset result when new image is uploaded
  };
  reader.readAsDataURL(file);
};

// Apply emoji size change without re-detecting faces
const applyEmojiSize = async () => {
  if (
    !sourceImage.value ||
    !selectedEmoji.value ||
    detectedFaces.value.length === 0
  ) {
    return;
  }

  isProcessing.value = true;

  try {
    // Create an image element from the source
    const img = new Image();
    img.src = sourceImage.value;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Create a canvas to work with
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");

    // Draw the original image on the canvas
    ctx.drawImage(img, 0, 0);

    // For each detected face, draw the emoji with the current size
    detectedFaces.value.forEach((face) => {
      const boundingBox = face.boundingBox;
      const sizeMultiplier = emojiSizePercent.value / 100;

      // Calculate adjusted dimensions
      const adjustedWidth = boundingBox.width * sizeMultiplier;
      const adjustedHeight = boundingBox.height * sizeMultiplier;

      // Calculate center point
      const centerX = boundingBox.originX + boundingBox.width / 2;
      const centerY = boundingBox.originY + boundingBox.height / 2;

      // Draw a semi-transparent circle to cover the face area
      // Use the background transparency value (convert from percentage to decimal)
      const opacity = backgroundTransparency.value / 100;
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, adjustedWidth / 2, 0, 2 * Math.PI);
      ctx.fill();

      // Draw the emoji with full opacity
      ctx.fillStyle = "#000000"; // Reset to solid black for the emoji
      ctx.font = `${adjustedHeight}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(selectedEmoji.value, centerX, centerY);
    });

    // Convert the canvas to an image
    resultImage.value = canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Error applying emoji size:", error);
    alert("Error applying emoji size. Please try again.");
  } finally {
    isProcessing.value = false;
  }
};

// Transform the image by swapping faces with emojis
const transformImage = async () => {
  if (!sourceImage.value || !selectedEmoji.value || !faceDetection) {
    return;
  }

  isProcessing.value = true;

  try {
    // Create an image element from the source
    const img = new Image();
    img.src = sourceImage.value;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    // Create a canvas to work with
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");

    // Draw the original image on the canvas
    ctx.drawImage(img, 0, 0);

    // Detect faces in the image
    const imageData = await createImageBitmap(img);
    const detections = faceDetection.detect(imageData);

    if (detections.detections && detections.detections.length > 0) {
      // Store detected faces for later use
      detectedFaces.value = detections.detections;

      // For each detected face, draw the emoji
      detectedFaces.value.forEach((face) => {
        const boundingBox = face.boundingBox;
        const sizeMultiplier = emojiSizePercent.value / 100;

        // Calculate adjusted dimensions
        const adjustedWidth = boundingBox.width * sizeMultiplier;
        const adjustedHeight = boundingBox.height * sizeMultiplier;

        // Calculate center point
        const centerX = boundingBox.originX + boundingBox.width / 2;
        const centerY = boundingBox.originY + boundingBox.height / 2;

        // Draw a semi-transparent circle to cover the face area
        // Use the background transparency value (convert from percentage to decimal)
        const opacity = backgroundTransparency.value / 100;
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, adjustedWidth / 2, 0, 2 * Math.PI);
        ctx.fill();

        // Draw the emoji with full opacity
        ctx.fillStyle = "#000000"; // Reset to solid black for the emoji
        ctx.font = `${adjustedHeight}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(selectedEmoji.value, centerX, centerY);
      });

      // Convert the canvas to an image
      resultImage.value = canvas.toDataURL("image/png");
    } else {
      alert("No faces detected in the image. Try another image.");
    }
  } catch (error) {
    console.error("Error processing image:", error);
    alert("Error processing image. Please try again.");
  } finally {
    isProcessing.value = false;
  }
};
</script>

<style>
/* Additional styles can be added here if needed */
</style>
