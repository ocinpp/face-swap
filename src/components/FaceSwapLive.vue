<template>
  <div class="min-h-screen bg-gray-100 flex flex-col items-center p-4">
    <h1 class="text-3xl font-bold mb-4">FaceSwap Live</h1>

    <!-- Photo Upload -->
    <div class="mb-4">
      <label class="block text-lg mb-2">Upload Photo</label>
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
      <button @click="captureImage" class="btn">Capture Live Swap</button>
      <button @click="swapPhotoWithLive" class="btn" :disabled="isProcessing">
        {{ isProcessing ? "Processing..." : "Swap Photo with Live" }}
      </button>
    </div>

    <!-- Face Previews -->
    <div class="mt-4 flex flex-wrap justify-center gap-4">
      <div class="text-center">
        <h2 class="text-xl font-semibold">Photo Face</h2>
        <div
          class="w-48 h-48 bg-gray-200 border border-gray-300 flex items-center justify-center overflow-hidden"
        >
          <img
            v-if="extractedPhotoFace"
            :src="extractedPhotoFace"
            class="max-w-full max-h-full"
          />
          <span v-else class="text-gray-500">No face detected</span>
        </div>
      </div>
      <div class="text-center">
        <h2 class="text-xl font-semibold">Live Face</h2>
        <div
          class="w-48 h-48 bg-gray-200 border border-gray-300 flex items-center justify-center overflow-hidden"
        >
          <img
            v-if="extractedLiveFace"
            :src="extractedLiveFace"
            class="max-w-full max-h-full"
          />
          <span v-else class="text-gray-500">No face detected</span>
        </div>
      </div>
    </div>

    <!-- Outputs -->
    <div class="mt-4">
      <h2 class="text-xl font-semibold">Live Swap Result</h2>
      <img v-if="liveSwapSrc" :src="liveSwapSrc" class="w-96 h-72 mt-2" />
    </div>
    <div class="mt-4">
      <h2 class="text-xl font-semibold">Photo Swap Result</h2>
      <img v-if="photoSwapSrc" :src="photoSwapSrc" class="w-96 h-72 mt-2" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { FaceMesh } from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import { useScriptTag } from "@vueuse/core";

useScriptTag(
  "https://docs.opencv.org/4.11.0/opencv.js",
  // on script tag loaded.
  (el) => {
    // do something
    onOpenCVLoaded();
  }
);

// Refs
const video = ref(null);
const canvas = ref(null);
const photoSrc = ref(null);
const liveSwapSrc = ref(null);
const photoSwapSrc = ref(null);
const extractedPhotoFace = ref(null);
const extractedLiveFace = ref(null);
const isProcessing = ref(false);
let photoImage = new Image();
let faceMesh = null;
let photoLandmarks = null;
let camera = null;
const isOpenCVLoaded = ref(false);

// Key facial landmarks for face extraction
// These indices represent important facial landmarks that outline the face
const FACE_OUTLINE_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];

// OpenCV.js load callback
window.onOpenCVLoaded = async () => {
  console.log("OpenCV.js loaded");
  cv = cv instanceof Promise ? await cv : cv;
  isOpenCVLoaded.value = true;
};

// Initialize MediaPipe FaceMesh
const initFaceMesh = async () => {
  if (faceMesh) return faceMesh;

  try {
    faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.3,
      minTrackingConfidence: 0.5,
    });
    faceMesh.onResults(onLiveResults);
    console.log("FaceMesh initialized");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return faceMesh;
  } catch (error) {
    console.error("Failed to initialize FaceMesh:", error);
    throw error;
  }
};

// Process live feed results
const onLiveResults = (results) => {
  if (!canvas.value || !video.value) return;

  const ctx = canvas.value.getContext("2d");
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.drawImage(video.value, 0, 0, canvas.value.width, canvas.value.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];

    // Extract and display live face in preview
    extractAndDisplayLiveFace(landmarks);

    if (photoSrc.value) {
      swapFace(ctx, landmarks);
    }
  }
};

// Extract face using landmarks and OpenCV
const extractFaceWithLandmarks = (
  image,
  landmarks,
  imageWidth,
  imageHeight
) => {
  if (!isOpenCVLoaded.value || !landmarks) return null;

  try {
    // Create a temporary canvas for the source image
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = imageWidth;
    tempCanvas.height = imageHeight;
    const ctx = tempCanvas.getContext("2d");
    ctx.drawImage(image, 0, 0, imageWidth, imageHeight);

    // Create OpenCV matrices
    const srcMat = cv.imread(tempCanvas);
    const mask = new cv.Mat(
      imageHeight,
      imageWidth,
      cv.CV_8UC1,
      new cv.Scalar(0)
    );
    const resultMat = new cv.Mat();

    // Create points array for face outline
    const points = new cv.MatVector();
    const contourPoints = [];

    // Extract face outline points from landmarks
    for (const idx of FACE_OUTLINE_INDICES) {
      if (landmarks[idx]) {
        contourPoints.push(
          new cv.Point(
            Math.round(landmarks[idx].x * imageWidth),
            Math.round(landmarks[idx].y * imageHeight)
          )
        );
      }
    }

    // Create contour and fill it
    if (contourPoints.length > 0) {
      const contour = new cv.Mat();
      contour.create(contourPoints.length, 1, cv.CV_32SC2);

      for (let i = 0; i < contourPoints.length; i++) {
        contour.data32S[i * 2] = contourPoints[i].x;
        contour.data32S[i * 2 + 1] = contourPoints[i].y;
      }

      points.push_back(contour);

      // Draw filled contour on mask
      cv.fillPoly(mask, points, new cv.Scalar(255));

      // Apply Gaussian blur to the mask edges for smoother blending
      cv.GaussianBlur(mask, mask, new cv.Size(15, 15), 0);

      // Apply the mask to the source image
      srcMat.copyTo(resultMat, mask);

      // Find bounding rectangle of the face contour
      const boundingRect = cv.boundingRect(contour);

      // Add some padding to the bounding rectangle
      const padding = 20;
      const x = Math.max(0, boundingRect.x - padding);
      const y = Math.max(0, boundingRect.y - padding);
      const width = Math.min(imageWidth - x, boundingRect.width + padding * 2);
      const height = Math.min(
        imageHeight - y,
        boundingRect.height + padding * 2
      );

      // Create ROI (Region of Interest) for the face
      const rect = new cv.Rect(x, y, width, height);
      const faceMat = resultMat.roi(rect);

      // Create output canvas for the extracted face
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = width;
      outputCanvas.height = height;

      // Display the extracted face
      cv.imshow(outputCanvas, faceMat);

      // Clean up
      srcMat.delete();
      mask.delete();
      resultMat.delete();
      faceMat.delete();
      contour.delete();
      points.delete();

      return outputCanvas.toDataURL("image/png");
    }

    // Clean up if no contour was created
    srcMat.delete();
    mask.delete();
    resultMat.delete();
    points.delete();

    return null;
  } catch (error) {
    console.error("Error extracting face with landmarks:", error);
    return null;
  }
};

// Extract and display live face in preview
const extractAndDisplayLiveFace = (landmarks) => {
  if (!landmarks || !video.value || !isOpenCVLoaded.value) return;

  try {
    const result = extractFaceWithLandmarks(
      video.value,
      landmarks,
      canvas.value.width,
      canvas.value.height
    );

    if (result) {
      // If we already have a previous URL, revoke it to prevent memory leaks
      if (extractedLiveFace.value) {
        URL.revokeObjectURL(extractedLiveFace.value);
      }
      extractedLiveFace.value = result;
    }
  } catch (error) {
    console.error("Error extracting live face:", error);
  }
};

// Original face swapping: photo face onto live feed
const swapFace = (ctx, landmarks) => {
  if (!landmarks || !photoImage) return;

  const faceWidth =
    Math.abs(landmarks[234].x - landmarks[454].x) * canvas.value.width;
  const faceHeight =
    Math.abs(landmarks[152].y - landmarks[10].y) * canvas.value.height;
  const faceX = landmarks[234].x * canvas.value.width;
  const faceY = landmarks[10].y * canvas.value.height;

  ctx.drawImage(photoImage, faceX, faceY, faceWidth, faceHeight);
};

// Custom function to detect face in static image
const detectFaceInImage = async (image) => {
  if (!faceMesh) {
    faceMesh = await initFaceMesh();
  }

  try {
    console.log("Starting face detection for image...");
    const results = await new Promise((resolve) => {
      const tempCallback = (results) => {
        console.log("Static FaceMesh results:", results);
        resolve(results);
        faceMesh.onResults(onLiveResults);
      };
      faceMesh.onResults(tempCallback);
      console.log("Sending image to FaceMesh...");
      faceMesh.send({ image }).catch((err) => {
        console.error("FaceMesh send error:", err);
        resolve(null);
        faceMesh.onResults(onLiveResults);
      });
    });
    console.log("Face detection completed:", results);
    return results;
  } catch (error) {
    console.error("Error in detectFaceInImage:", error, "Stack:", error.stack);
    return null;
  }
};

// Extract and display photo face in preview
const extractAndDisplayPhotoFace = (landmarks) => {
  if (!landmarks || !photoImage || !isOpenCVLoaded.value) return;

  try {
    const result = extractFaceWithLandmarks(
      photoImage,
      landmarks,
      photoImage.width,
      photoImage.height
    );

    if (result) {
      // If we already have a previous URL, revoke it to prevent memory leaks
      if (extractedPhotoFace.value) {
        URL.revokeObjectURL(extractedPhotoFace.value);
      }
      extractedPhotoFace.value = result;
    }
  } catch (error) {
    console.error("Error extracting photo face:", error);
  }
};

// Upload photo and detect face landmarks
const uploadPhoto = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    // Revoke previous object URL to prevent memory leaks
    if (photoSrc.value) {
      URL.revokeObjectURL(photoSrc.value);
    }

    // Reset face preview
    extractedPhotoFace.value = null;

    photoSrc.value = URL.createObjectURL(file);
    photoImage = new Image();
    photoImage.src = photoSrc.value;

    await new Promise((resolve) => {
      photoImage.onload = () => {
        console.log("Photo loaded:", photoImage.width, photoImage.height);
        resolve();
      };
      photoImage.onerror = (err) => {
        console.error("Error loading photo:", err);
        resolve();
      };
    });

    if (!faceMesh) await initFaceMesh();

    const results = await detectFaceInImage(photoImage);
    console.log("Detection results:", results);

    if (
      results &&
      results.multiFaceLandmarks &&
      results.multiFaceLandmarks.length > 0
    ) {
      photoLandmarks = results.multiFaceLandmarks[0];
      console.log("Face detected in photo, landmarks:", photoLandmarks);

      // Extract and display the photo face
      extractAndDisplayPhotoFace(photoLandmarks);
    } else {
      console.warn("No face detected in photo or results undefined!");
      alert("No face detected in the photo!");
      photoLandmarks = null;
    }
  } catch (error) {
    console.error("Error in uploadPhoto:", error, "Stack:", error.stack);
    alert("Error processing photo: " + (error.message || "Unknown error"));
  }
};

// Start camera
const startCamera = async () => {
  try {
    if (!video.value) {
      console.error("Video element not found");
      return;
    }

    if (!faceMesh) await initFaceMesh();

    // Stop any existing camera
    if (camera) {
      await camera.stop();
    }

    // Reset face preview
    extractedLiveFace.value = null;

    // Set canvas dimensions to match video
    if (canvas.value) {
      canvas.value.width = video.value.clientWidth;
      canvas.value.height = video.value.clientHeight;
    }

    camera = new Camera(video.value, {
      onFrame: async () => {
        if (faceMesh && video.value) {
          await faceMesh.send({ image: video.value });
        }
      },
      width: 640,
      height: 480,
    });
    await camera.start();
    console.log("Camera started");
  } catch (error) {
    console.error("Error starting camera:", error, "Stack:", error.stack);
    alert("Failed to start camera: " + (error.message || "Unknown error"));
  }
};

// Capture the current canvas (live swap)
const captureImage = () => {
  try {
    if (!canvas.value) {
      console.error("Canvas element not found");
      return;
    }

    liveSwapSrc.value = canvas.value.toDataURL("image/png");
    console.log("Live swap captured");
  } catch (error) {
    console.error("Error capturing live swap:", error, "Stack:", error.stack);
    alert("Error capturing image: " + (error.message || "Unknown error"));
  }
};

// Safely delete OpenCV matrices
const safeDelete = (matrices) => {
  if (!matrices) return;

  const matrixArray = Array.isArray(matrices) ? matrices : [matrices];
  matrixArray.forEach((mat) => {
    if (mat && !mat.isDeleted) {
      try {
        mat.delete();
      } catch (e) {
        console.warn("Error deleting matrix:", e);
      }
    }
  });
};

// Replace the existing swapPhotoWithLive function with this improved version that uses facial landmarks for more accurate face swapping

// Swap live feed face onto the photo with alpha blending
const swapPhotoWithLive = async () => {
  if (isProcessing.value) return;
  isProcessing.value = true;

  // Define all matrices outside try block for proper cleanup
  let srcMat = null,
    liveMat = null,
    maskMat = null,
    warpMat = null,
    warpedLiveMat = null,
    warpedMaskMat = null,
    alphaMat = null,
    oneMinusAlpha = null,
    liveWeighted = null,
    srcWeighted = null,
    resultMat = null,
    finalMat = null,
    srcMatFloat = null,
    warpedLiveMatFloat = null,
    alphaMatC3 = null,
    oneMinusAlphaC3 = null,
    liveFaceMask = null;

  // Define vectors
  let alphaChannels = null,
    oneMinusAlphaChannels = null,
    points = null,
    contour = null;

  try {
    console.log("Starting swapPhotoWithLive...");
    if (!isOpenCVLoaded.value || typeof cv === "undefined" || !cv.Mat) {
      console.error("OpenCV.js not fully loaded or initialized!");
      alert("OpenCV.js not ready! Please wait and try again.");
      return;
    }
    if (!photoSrc.value || !photoLandmarks) {
      alert("Please upload a photo with a detectable face first!");
      return;
    }
    if (!video.value || video.value.readyState < 2) {
      alert("Camera not ready! Please start the camera first.");
      return;
    }

    if (!faceMesh) await initFaceMesh();

    // Step 1: Detect live face
    console.log("Detecting live face...");
    const liveResults = await detectFaceInImage(video.value);
    console.log("Live detection results:", liveResults);
    if (!liveResults?.multiFaceLandmarks?.length) {
      alert("No face detected in the live feed!");
      return;
    }
    const liveLandmarks = liveResults.multiFaceLandmarks[0];
    console.log("Live landmarks:", liveLandmarks);

    // Update live face preview
    extractAndDisplayLiveFace(liveLandmarks);

    // Step 2: Setup canvas
    console.log("Creating temp canvas...");
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = photoImage.width;
    tempCanvas.height = photoImage.height;
    const ctx = tempCanvas.getContext("2d");
    try {
      ctx.drawImage(photoImage, 0, 0);
      console.log("Photo drawn to canvas");
    } catch (drawError) {
      throw new Error("Failed to draw photo to canvas: " + drawError.message);
    }

    if (!photoLandmarks[234] || !liveLandmarks[234]) {
      console.error("Landmarks missing:", { photoLandmarks, liveLandmarks });
      alert("Error: Face landmarks incomplete!");
      return;
    }

    // Step 3: Calculate transform
    console.log("Calculating transform...");
    const photoPoints = [
      [
        photoLandmarks[234].x * photoImage.width,
        photoLandmarks[234].y * photoImage.height,
      ],
      [
        photoLandmarks[454].x * photoImage.width,
        photoLandmarks[454].y * photoImage.height,
      ],
      [
        photoLandmarks[0].x * photoImage.width,
        photoLandmarks[0].y * photoImage.height,
      ],
    ];
    const livePoints = [
      [
        liveLandmarks[234].x * canvas.value.width,
        liveLandmarks[234].y * canvas.value.height,
      ],
      [
        liveLandmarks[454].x * canvas.value.width,
        liveLandmarks[454].y * canvas.value.height,
      ],
      [
        liveLandmarks[0].x * canvas.value.width,
        liveLandmarks[0].y * canvas.value.height,
      ],
    ];
    const transform = getAffineTransform(livePoints, photoPoints);
    console.log("Transform calculated:", transform);

    // Step 4: Create a video canvas for the live feed
    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = canvas.value.width;
    videoCanvas.height = canvas.value.height;
    const videoCtx = videoCanvas.getContext("2d");
    videoCtx.drawImage(
      video.value,
      0,
      0,
      videoCanvas.width,
      videoCanvas.height
    );

    // Step 5: OpenCV blending with landmark-based mask
    console.log("Starting OpenCV blending with landmarks...");
    try {
      // Create source and live matrices
      srcMat = cv.imread(photoImage);
      liveMat = cv.imread(videoCanvas);

      // Create a mask using facial landmarks for the live face
      liveFaceMask = new cv.Mat(
        videoCanvas.height,
        videoCanvas.width,
        cv.CV_8UC1,
        new cv.Scalar(0)
      );
      points = new cv.MatVector();
      contour = new cv.Mat();

      // Extract face outline points from landmarks
      const contourPoints = [];
      for (const idx of FACE_OUTLINE_INDICES) {
        if (liveLandmarks[idx]) {
          contourPoints.push(
            new cv.Point(
              Math.round(liveLandmarks[idx].x * videoCanvas.width),
              Math.round(liveLandmarks[idx].y * videoCanvas.height)
            )
          );
        }
      }

      // Create contour and fill it
      if (contourPoints.length > 0) {
        contour.create(contourPoints.length, 1, cv.CV_32SC2);

        for (let i = 0; i < contourPoints.length; i++) {
          contour.data32S[i * 2] = contourPoints[i].x;
          contour.data32S[i * 2 + 1] = contourPoints[i].y;
        }

        points.push_back(contour);

        // Draw filled contour on mask
        cv.fillPoly(liveFaceMask, points, new cv.Scalar(255));

        // Apply Gaussian blur to the mask edges for smoother blending
        cv.GaussianBlur(liveFaceMask, liveFaceMask, new cv.Size(21, 21), 0);
      } else {
        throw new Error("Failed to create face contour from landmarks");
      }

      // Create warp matrix and apply transformation
      warpMat = cv.matFromArray(2, 3, cv.CV_32FC1, transform);
      warpedLiveMat = new cv.Mat();
      warpedMaskMat = new cv.Mat();

      cv.warpAffine(
        liveMat,
        warpedLiveMat,
        warpMat,
        new cv.Size(srcMat.cols, srcMat.rows),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );

      cv.warpAffine(
        liveFaceMask,
        warpedMaskMat,
        warpMat,
        new cv.Size(srcMat.cols, srcMat.rows),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );

      // Create alpha and one-minus-alpha matrices
      alphaMat = new cv.Mat();
      warpedMaskMat.convertTo(alphaMat, cv.CV_32FC1, 1 / 255.0);

      oneMinusAlpha = new cv.Mat();
      cv.subtract(
        cv.Mat.ones(alphaMat.rows, alphaMat.cols, cv.CV_32FC1),
        alphaMat,
        oneMinusAlpha
      );

      // Convert to float for multiplication
      warpedLiveMatFloat = new cv.Mat();
      warpedLiveMat.convertTo(warpedLiveMatFloat, cv.CV_32FC3);

      srcMatFloat = new cv.Mat();
      srcMat.convertTo(srcMatFloat, cv.CV_32FC3);

      // Try a simpler approach using split/merge for alpha blending
      try {
        console.log("Using channel-by-channel blending approach");

        // Split source and warped images into channels
        const srcChannels = new cv.MatVector();
        const warpedChannels = new cv.MatVector();
        const resultChannels = new cv.MatVector();

        cv.split(srcMatFloat, srcChannels);
        cv.split(warpedLiveMatFloat, warpedChannels);

        // Process each channel separately
        for (let i = 0; i < 3; i++) {
          const blendedChannel = new cv.Mat();
          const srcWeightedChannel = new cv.Mat();
          const warpedWeightedChannel = new cv.Mat();

          // Apply alpha to warped image channel
          cv.multiply(warpedChannels.get(i), alphaMat, warpedWeightedChannel);

          // Apply (1-alpha) to source image channel
          cv.multiply(srcChannels.get(i), oneMinusAlpha, srcWeightedChannel);

          // Add the weighted channels
          cv.add(warpedWeightedChannel, srcWeightedChannel, blendedChannel);

          resultChannels.push_back(blendedChannel);

          // Clean up
          srcWeightedChannel.delete();
          warpedWeightedChannel.delete();
        }

        // Merge channels back
        resultMat = new cv.Mat();
        cv.merge(resultChannels, resultMat);

        // Clean up
        for (let i = 0; i < 3; i++) {
          srcChannels.get(i).delete();
          warpedChannels.get(i).delete();
          resultChannels.get(i).delete();
        }
        srcChannels.delete();
        warpedChannels.delete();
        resultChannels.delete();
      } catch (channelError) {
        console.error("Channel-by-channel blending failed:", channelError);

        // Fall back to the original approach with 3-channel alpha
        console.log("Falling back to 3-channel alpha approach");

        // Create 3-channel alpha matrices
        alphaChannels = new cv.MatVector();
        alphaChannels.push_back(alphaMat);
        alphaChannels.push_back(alphaMat);
        alphaChannels.push_back(alphaMat);

        alphaMatC3 = new cv.Mat();
        cv.merge(alphaChannels, alphaMatC3);

        oneMinusAlphaChannels = new cv.MatVector();
        oneMinusAlphaChannels.push_back(oneMinusAlpha);
        oneMinusAlphaChannels.push_back(oneMinusAlpha);
        oneMinusAlphaChannels.push_back(oneMinusAlpha);

        oneMinusAlphaC3 = new cv.Mat();
        cv.merge(oneMinusAlphaChannels, oneMinusAlphaC3);

        // Perform blending
        liveWeighted = new cv.Mat();
        srcWeighted = new cv.Mat();

        cv.multiply(warpedLiveMatFloat, alphaMatC3, liveWeighted);
        cv.multiply(srcMatFloat, oneMinusAlphaC3, srcWeighted);

        resultMat = new cv.Mat();
        cv.add(liveWeighted, srcWeighted, resultMat);
      }

      // Convert result to 8-bit for display
      finalMat = new cv.Mat();
      resultMat.convertTo(finalMat, cv.CV_8UC3);

      // Display result
      cv.imshow(tempCanvas, finalMat);
      photoSwapSrc.value = tempCanvas.toDataURL("image/png");
      console.log("Photo swap completed with landmark-based mask");
    } catch (cvError) {
      console.error(
        "OpenCV blending failed:",
        cvError,
        "Stack:",
        cvError.stack
      );
      alert(
        "OpenCV blending failed: " + (cvError.message || "Unknown OpenCV error")
      );
      // Fallback to Canvas blending
      console.log("Falling back to Canvas blending...");
      try {
        // Reset the canvas
        ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        ctx.drawImage(photoImage, 0, 0);

        // Create a temporary canvas for the warped face
        const warpCanvas = document.createElement("canvas");
        warpCanvas.width = photoImage.width;
        warpCanvas.height = photoImage.height;
        const warpCtx = warpCanvas.getContext("2d");

        // Apply a simple transform using canvas
        warpCtx.save();

        // Approximate the affine transform with canvas transform
        const tx =
          photoPoints[0][0] -
          livePoints[0][0] * (photoImage.width / canvas.value.width);
        const ty =
          photoPoints[0][1] -
          livePoints[0][1] * (photoImage.height / canvas.value.height);
        const scaleX =
          ((photoPoints[1][0] - photoPoints[0][0]) /
            (livePoints[1][0] - livePoints[0][0])) *
          (photoImage.width / canvas.value.width);
        const scaleY =
          ((photoPoints[2][1] - photoPoints[0][1]) /
            (livePoints[2][1] - livePoints[0][1])) *
          (photoImage.height / canvas.value.height);

        warpCtx.translate(tx, ty);
        warpCtx.scale(scaleX, scaleY);
        warpCtx.drawImage(video.value, 0, 0);
        warpCtx.restore();

        // Blend with the original photo
        ctx.globalAlpha = 0.7; // More weight to the live face
        ctx.drawImage(warpCanvas, 0, 0);
        ctx.globalAlpha = 1.0;

        photoSwapSrc.value = tempCanvas.toDataURL("image/png");
        console.log("Canvas fallback completed");
      } catch (fallbackError) {
        throw new Error("Canvas fallback failed: " + fallbackError.message);
      }
    }
  } catch (error) {
    console.error("Error in swapPhotoWithLive:", error, "Stack:", error.stack);
    alert(
      "Error swapping photo with live: " + (error.message || "Unknown error")
    );
  } finally {
    // Clean up all OpenCV resources
    safeDelete([
      srcMat,
      liveMat,
      maskMat,
      warpMat,
      warpedLiveMat,
      warpedMaskMat,
      alphaMat,
      oneMinusAlpha,
      liveWeighted,
      srcWeighted,
      resultMat,
      finalMat,
      srcMatFloat,
      warpedLiveMatFloat,
      alphaMatC3,
      oneMinusAlphaC3,
      liveFaceMask,
    ]);

    // Clean up vectors and contours
    if (alphaChannels) alphaChannels.delete();
    if (oneMinusAlphaChannels) oneMinusAlphaChannels.delete();
    if (points) points.delete();
    if (contour) contour.delete();

    console.log("Resources cleaned up");
    isProcessing.value = false;
  }
};

// Affine transform and linear system solver (unchanged)
const getAffineTransform = (srcPoints, dstPoints) => {
  const A = [];
  const B = [];
  for (let i = 0; i < 3; i++) {
    A.push([srcPoints[i][0], srcPoints[i][1], 1, 0, 0, 0]);
    A.push([0, 0, 0, srcPoints[i][0], srcPoints[i][1], 1]);
    B.push(dstPoints[i][0]);
    B.push(dstPoints[i][1]);
  }
  return solveLinearSystem(A, B);
};

const solveLinearSystem = (A, B) => {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }
    for (let k = i; k < n + 1; k++) {
      const tmp = A[maxRow][k];
      A[maxRow][k] = A[i][k];
      A[i][k] = tmp;
    }
    const tmp = B[maxRow];
    B[maxRow] = B[i];
    B[i] = tmp;

    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n + 1; j++) {
        if (i === j) A[k][j] = 0;
        else A[k][j] += c * A[i][j];
      }
      B[k] += c * B[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = B[i] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      B[k] -= A[k][i] * x[i];
    }
  }
  return x.slice(0, 6);
};

// Clean up resources on unmount
onUnmounted(() => {
  if (camera) {
    camera.stop();
  }

  // Release FaceMesh resources
  if (faceMesh) {
    faceMesh.close();
  }

  // Revoke object URLs to prevent memory leaks
  if (photoSrc.value) {
    URL.revokeObjectURL(photoSrc.value);
  }
  if (liveSwapSrc.value) {
    URL.revokeObjectURL(liveSwapSrc.value);
  }
  if (photoSwapSrc.value) {
    URL.revokeObjectURL(photoSwapSrc.value);
  }
  if (extractedPhotoFace.value) {
    URL.revokeObjectURL(extractedPhotoFace.value);
  }
  if (extractedLiveFace.value) {
    URL.revokeObjectURL(extractedLiveFace.value);
  }
});

// Initialize on mount
onMounted(async () => {
  try {
    await initFaceMesh();
  } catch (error) {
    console.error("Error during mount:", error, "Stack:", error.stack);
  }
});
</script>

<style scoped>
@reference "tailwindcss";

.btn {
  @apply py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
