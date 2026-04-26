import { Injectable } from '@angular/core';
import type { StynxUploadExecutor } from './types';

@Injectable()
export class XhrUploadExecutor implements StynxUploadExecutor {
  upload(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress: (value: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('PUT', url, true);
      for (const [key, value] of Object.entries(headers)) {
        request.setRequestHeader(key, value);
      }
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total === 0) {
          return;
        }
        onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          onProgress(100);
          resolve();
          return;
        }
        reject(new Error(`Upload failed with status ${request.status}`));
      };
      request.onerror = () => reject(new Error('Upload failed'));
      request.send(file);
    });
  }
}
