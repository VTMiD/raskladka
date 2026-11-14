import { AMNTECH_THC } from './amntech-thc.js';

export const POSTS = { [AMNTECH_THC.id]: AMNTECH_THC };
export const DEFAULT_POST_ID = AMNTECH_THC.id;

export function getPost(id) {
  return POSTS[id] || POSTS[DEFAULT_POST_ID];
}

export function listPosts() {
  return Object.values(POSTS);
}