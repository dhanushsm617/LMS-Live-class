/**
 * fetch() can't report upload progress, so large video uploads use XMLHttpRequest.
 * Resolves with the parsed JSON body; rejects with an Error carrying the server message.
 */
export function uploadVideo(lessonId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('video', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/lessons/${lessonId}/video`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}
