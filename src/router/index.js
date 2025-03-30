import { createRouter, createWebHistory } from "vue-router";
import FaceEmojiSwapper from "../components/FaceEmojiSwapper.vue";
import FaceSwapLive from "../components/FaceSwapLive.vue";

const routes = [
  {
    path: "/",
    component: FaceSwapLive,
  },
  {
    path: "/emoji",
    component: FaceEmojiSwapper,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
