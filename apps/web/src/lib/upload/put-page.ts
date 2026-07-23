// Direct-to-storage upload of one page's bytes to its presigned URL
// (decision 0019): browser straight to object storage, no token in play. XHR
// rather than fetch because we need upload-progress events, which fetch still
// does not expose. Resolves true on a 2xx and false on anything else, so the
// controller treats every failure the same and the page becomes retryable. The
// content-type is not set: the presigned PUT does not sign it, and adding an
// unsigned header risks a signature mismatch on some S3 implementations.
export function putPage(
  url: string,
  blob: Blob,
  onProgress: (fraction: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(blob);
  });
}
