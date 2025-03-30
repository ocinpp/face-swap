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
      <button @click="swapPhotoWithLive" class="btn">
        Swap Photo with Live
      </button>
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
import { ref, onMounted } from "vue";
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
let photoImage = new Image();
let faceMesh = null;
let photoLandmarks = null;
const isOpenCVLoaded = ref(false);

// OpenCV.js load callback
window.onOpenCVLoaded = async () => {
  console.log("OpenCV.js loaded");
  cv = cv instanceof Promise ? await cv : cv;
  isOpenCVLoaded.value = true;
};

// Initialize MediaPipe FaceMesh
const initFaceMesh = async () => {
  if (faceMesh) return;
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
  } catch (error) {
    console.error("Failed to initialize FaceMesh:", error);
    throw error;
  }
};

// Process live feed results
const onLiveResults = (results) => {
  const ctx = canvas.value.getContext("2d");
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  ctx.drawImage(video.value, 0, 0, canvas.value.width, canvas.value.height);

  if (results.multiFaceLandmarks && photoSrc.value) {
    const landmarks = results.multiFaceLandmarks[0];
    swapFace(ctx, landmarks);
  }
};

// Original face swapping: photo face onto live feed
const swapFace = (ctx, landmarks) => {
  if (!landmarks) return;
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

// Upload photo and detect face landmarks
const uploadPhoto = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    photoSrc.value = URL.createObjectURL(file);
    photoImage.src = photoSrc.value;

    await new Promise((resolve) => {
      photoImage.onload = () => {
        console.log("Photo loaded:", photoImage.width, photoImage.height);
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
    if (!faceMesh) await initFaceMesh();
    const camera = new Camera(video.value, {
      onFrame: async () => {
        await faceMesh.send({ image: video.value });
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
    liveSwapSrc.value = canvas.value.toDataURL("image/png");
    console.log("Live swap captured");
  } catch (error) {
    console.error("Error capturing live swap:", error, "Stack:", error.stack);
    alert("Error capturing image: " + (error.message || "Unknown error"));
  }
};

// Swap live feed face onto the photo with alpha blending
const swapPhotoWithLive = async () => {
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

    // Step 4: Extract live face
    console.log("Extracting live face...");
    const liveFaceWidth = Math.max(
      1,
      Math.abs(liveLandmarks[234].x - liveLandmarks[454].x) *
        canvas.value.width *
        1.5
    );
    const liveFaceHeight = Math.max(
      1,
      Math.abs(liveLandmarks[152].y - liveLandmarks[10].y) *
        canvas.value.height *
        1.5
    );
    const liveFaceX =
      liveLandmarks[234].x * canvas.value.width - liveFaceWidth * 0.25;
    const liveFaceY =
      liveLandmarks[10].y * canvas.value.height - liveFaceHeight * 0.25;

    console.log("Live face dimensions:", {
      liveFaceWidth,
      liveFaceHeight,
      liveFaceX,
      liveFaceY,
    });

    const liveCanvas = document.createElement("canvas");
    liveCanvas.width = liveFaceWidth;
    liveCanvas.height = liveFaceHeight;
    const liveCtx = liveCanvas.getContext("2d");
    try {
      liveCtx.drawImage(
        video.value,
        liveFaceX,
        liveFaceY,
        liveFaceWidth,
        liveFaceHeight,
        0,
        0,
        liveFaceWidth,
        liveFaceHeight
      );
      console.log("Live face drawn to canvas");
    } catch (drawError) {
      throw new Error(
        "Failed to draw live face to canvas: " + drawError.message
      );
    }

    // Step 5: OpenCV blending
    console.log("Starting OpenCV blending...");
    let srcMat,
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
      alphaChannels,
      oneMinusAlphaChannels;
    try {
      srcMat = cv.imread(photoImage);
      console.log("Source Mat created:", {
        rows: srcMat.rows,
        cols: srcMat.cols,
        type: srcMat.type(),
      });
      liveMat = cv.imread(liveCanvas);
      console.log("Live Mat created:", {
        rows: liveMat.rows,
        cols: liveMat.cols,
        type: liveMat.type(),
      });

      maskMat = new cv.Mat(liveFaceHeight, liveFaceWidth, cv.CV_8UC1);
      console.log("maskMat created:", {
        rows: maskMat.rows,
        cols: maskMat.cols,
        type: maskMat.type(),
      });
      maskMat.setTo(new cv.Scalar(0));
      cv.rectangle(
        maskMat,
        new cv.Point(10, 10),
        new cv.Point(liveFaceWidth - 10, liveFaceHeight - 10),
        new cv.Scalar(255),
        -1
      );
      cv.GaussianBlur(maskMat, maskMat, new cv.Size(21, 21), 0);
      console.log("Mask created");

      warpMat = cv.matFromArray(2, 3, cv.CV_32FC1, transform);
      warpedLiveMat = new cv.Mat();
      warpedMaskMat = new cv.Mat();
      cv.warpAffine(
        liveMat,
        warpedLiveMat,
        warpMat,
        srcMat.size(),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );
      console.log("Live face warped:", {
        rows: warpedLiveMat.rows,
        cols: warpedLiveMat.cols,
        type: warpedLiveMat.type(),
      });
      cv.warpAffine(
        maskMat,
        warpedMaskMat,
        warpMat,
        srcMat.size(),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );
      console.log("Mask warped:", {
        rows: warpedMaskMat.rows,
        cols: warpedMaskMat.cols,
        type: warpedMaskMat.type(),
      });

      alphaMat = new cv.Mat();
      warpedMaskMat.convertTo(alphaMat, cv.CV_32FC1, 1 / 255.0);
      console.log("Alpha Mat created:", {
        rows: alphaMat.rows,
        cols: alphaMat.cols,
        type: alphaMat.type(),
      });

      oneMinusAlpha = new cv.Mat();
      cv.subtract(
        cv.Mat.ones(alphaMat.rows, alphaMat.cols, cv.CV_32FC1),
        alphaMat,
        oneMinusAlpha
      );
      console.log("One minus alpha created:", {
        rows: oneMinusAlpha.rows,
        cols: oneMinusAlpha.cols,
        type: oneMinusAlpha.type(),
      });

      // Convert warpedLiveMat to CV_32FC3 before multiplication
      warpedLiveMatFloat = new cv.Mat();
      warpedLiveMat.convertTo(warpedLiveMatFloat, cv.CV_32FC3);
      console.log("Converted warpedLiveMat to float:", {
        rows: warpedLiveMatFloat.rows,
        cols: warpedLiveMatFloat.cols,
        type: warpedLiveMatFloat.type(),
      });

      // Convert srcMat to CV_32FC3 before multiplication
      srcMatFloat = new cv.Mat();
      srcMat.convertTo(srcMatFloat, cv.CV_32FC3);
      console.log("Converted srcMat to float:", {
        rows: srcMatFloat.rows,
        cols: srcMatFloat.cols,
        type: srcMatFloat.type(),
      });

      // Create 3-channel alpha mat for multiplication with RGB image
      alphaMatC3 = new cv.Mat();
      alphaChannels = new cv.MatVector();
      alphaChannels.push_back(alphaMat);
      alphaChannels.push_back(alphaMat);
      alphaChannels.push_back(alphaMat);
      cv.merge(alphaChannels, alphaMatC3);
      console.log("Created 3-channel alpha mat:", {
        rows: alphaMatC3.rows,
        cols: alphaMatC3.cols,
        type: alphaMatC3.type(),
        channels: alphaMatC3.channels(),
      });

      // Create 3-channel oneMinusAlpha for multiplication with RGB image
      oneMinusAlphaC3 = new cv.Mat();
      oneMinusAlphaChannels = new cv.MatVector();
      oneMinusAlphaChannels.push_back(oneMinusAlpha);
      oneMinusAlphaChannels.push_back(oneMinusAlpha);
      oneMinusAlphaChannels.push_back(oneMinusAlpha);
      cv.merge(oneMinusAlphaChannels, oneMinusAlphaC3);
      console.log("Created 3-channel oneMinusAlpha:", {
        rows: oneMinusAlphaC3.rows,
        cols: oneMinusAlphaC3.cols,
        type: oneMinusAlphaC3.type(),
        channels: oneMinusAlphaC3.channels(),
      });

      liveWeighted = new cv.Mat();
      try {
        // Make sure dimensions match
        if (
          warpedLiveMatFloat.rows !== alphaMatC3.rows ||
          warpedLiveMatFloat.cols !== alphaMatC3.cols
        ) {
          console.log("Dimension mismatch, resizing alphaMatC3");
          const resizedAlphaMatC3 = new cv.Mat();
          cv.resize(
            alphaMatC3,
            resizedAlphaMatC3,
            new cv.Size(warpedLiveMatFloat.cols, warpedLiveMatFloat.rows)
          );
          alphaMatC3.delete();
          alphaMatC3 = resizedAlphaMatC3;
        }

        // Use element-wise multiplication
        cv.multiply(warpedLiveMatFloat, alphaMatC3, liveWeighted);
        console.log("Live weighted calculated:", {
          rows: liveWeighted.rows,
          cols: liveWeighted.cols,
          type: liveWeighted.type(),
          channels: liveWeighted.channels(),
        });
      } catch (multiplyError) {
        console.log("Multiply error details:", multiplyError);
        // Try alternative approach if the first one fails
        try {
          console.log("Trying alternative multiplication approach");
          // Split the image into channels and multiply each channel separately
          const channels = new cv.MatVector();
          cv.split(warpedLiveMatFloat, channels);

          const resultChannels = new cv.MatVector();
          for (let i = 0; i < 3; i++) {
            const resultChannel = new cv.Mat();
            cv.multiply(channels.get(i), alphaMat, resultChannel);
            resultChannels.push_back(resultChannel);
            channels.get(i).delete();
          }

          cv.merge(resultChannels, liveWeighted);

          // Clean up
          for (let i = 0; i < 3; i++) {
            resultChannels.get(i).delete();
          }
          resultChannels.delete();
          channels.delete();
        } catch (altError) {
          console.log("Alternative approach failed:", altError);
          throw new Error(
            "cv.multiply failed for liveWeighted: " +
              (multiplyError.message || "Unknown error")
          );
        }
      }

      srcWeighted = new cv.Mat();
      try {
        // Make sure dimensions match
        if (
          srcMatFloat.rows !== oneMinusAlphaC3.rows ||
          srcMatFloat.cols !== oneMinusAlphaC3.cols
        ) {
          console.log("Dimension mismatch, resizing oneMinusAlphaC3");
          const resizedOneMinusAlphaC3 = new cv.Mat();
          cv.resize(
            oneMinusAlphaC3,
            resizedOneMinusAlphaC3,
            new cv.Size(srcMatFloat.cols, srcMatFloat.rows)
          );
          oneMinusAlphaC3.delete();
          oneMinusAlphaC3 = resizedOneMinusAlphaC3;
        }

        cv.multiply(srcMatFloat, oneMinusAlphaC3, srcWeighted);
        console.log("Source weighted calculated:", {
          rows: srcWeighted.rows,
          cols: srcWeighted.cols,
          type: srcWeighted.type(),
          channels: srcWeighted.channels(),
        });
      } catch (multiplyError) {
        // Try alternative approach
        try {
          console.log("Trying alternative multiplication approach for source");
          // Split the image into channels and multiply each channel separately
          const channels = new cv.MatVector();
          cv.split(srcMatFloat, channels);

          const resultChannels = new cv.MatVector();
          for (let i = 0; i < 3; i++) {
            const resultChannel = new cv.Mat();
            cv.multiply(channels.get(i), oneMinusAlpha, resultChannel);
            resultChannels.push_back(resultChannel);
            channels.get(i).delete();
          }

          cv.merge(resultChannels, srcWeighted);

          // Clean up
          for (let i = 0; i < 3; i++) {
            resultChannels.get(i).delete();
          }
          resultChannels.delete();
          channels.delete();
        } catch (altError) {
          throw new Error(
            "cv.multiply failed for srcWeighted: " +
              (multiplyError.message || "Unknown error")
          );
        }
      }

      resultMat = new cv.Mat();
      cv.add(liveWeighted, srcWeighted, resultMat);
      console.log("Result Mat created:", {
        rows: resultMat.rows,
        cols: resultMat.cols,
        type: resultMat.type(),
      });

      finalMat = new cv.Mat();
      resultMat.convertTo(finalMat, cv.CV_8UC3);
      console.log("Final Mat converted:", {
        rows: finalMat.rows,
        cols: finalMat.cols,
        type: finalMat.type(),
      });

      cv.imshow(tempCanvas, finalMat);
      photoSwapSrc.value = tempCanvas.toDataURL("image/png");
      console.log("Photo swap completed");
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
        ctx.globalAlpha = 0.5;
        ctx.drawImage(
          liveCanvas,
          liveFaceX,
          liveFaceY,
          liveFaceWidth,
          liveFaceHeight
        );
        ctx.globalAlpha = 1.0;
        photoSwapSrc.value = tempCanvas.toDataURL("image/png");
        console.log("Canvas fallback completed");
      } catch (fallbackError) {
        throw new Error("Canvas fallback failed: " + fallbackError.message);
      }
    } finally {
      // Clean up resources
      [
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
      ].forEach((mat) => mat?.delete());

      // Clean up vectors
      if (alphaChannels) alphaChannels.delete();
      if (oneMinusAlphaChannels) oneMinusAlphaChannels.delete();

      console.log("Resources cleaned up");
    }
  } catch (error) {
    console.error("Error in swapPhotoWithLive:", error, "Stack:", error.stack);
    alert(
      "Error swapping photo with live: " + (error.message || "Unknown error")
    );
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
  @apply py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600;
}
</style>
