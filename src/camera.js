/**
 * Camera - Image capture + OCR-like description via canvas
 * Uses browser APIs only, no external services
 */

export class Camera {

  /**
   * Capture image from camera
   * @returns {Promise<{blob: Blob, dataUrl: string}>}
   */
  capture() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { reject(new Error('No image')); return; }

        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            blob: file,
            dataUrl: reader.result,
            name: file.name,
            size: file.size,
            type: file.type
          });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      };

      input.click();
    });
  }

  /**
   * Pick image from gallery
   * @returns {Promise<{blob: Blob, dataUrl: string}>}
   */
  pick() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { reject(new Error('No image')); return; }

        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            blob: file,
            dataUrl: reader.result,
            name: file.name,
            size: file.size,
            type: file.type
          });
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      };

      input.click();
    });
  }

  /**
   * Resize image to reduce memory usage
   * @param {string} dataUrl
   * @param {number} maxWidth
   * @returns {Promise<string>} Resized data URL
   */
  resize(dataUrl, maxWidth = 800) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    });
  }
}
