/**
 * Camera - Image capture and gallery picker via file inputs
 * Works on iOS Safari, Android Chrome, and desktop browsers.
 * No getUserMedia needed — uses native file picker UI.
 */

export class Camera {
  constructor() {
    // Pre-create hidden file inputs so they're ready
    this._captureInput = null;
    this._pickInput = null;
  }

  /**
   * Capture image from camera
   * Opens the native camera on mobile, file picker on desktop.
   * @returns {Promise<{blob: Blob, dataUrl: string, name: string, size: number, type: string}>}
   */
  capture() {
    return new Promise((resolve, reject) => {
      // Create fresh input each time (iOS Safari requires it)
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // Rear camera preferred
      input.style.display = 'none';

      // Append to body briefly (needed for some iOS versions)
      document.body.appendChild(input);

      const cleanup = () => {
        try { document.body.removeChild(input); } catch {}
      };

      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        cleanup();
        if (!file) {
          reject(new Error('No image'));
          return;
        }
        this._readFile(file).then(resolve).catch(reject);
      };

      // Handle cancel (user closes picker without selecting)
      // Focus event fires after picker closes on most browsers
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            cleanup();
            reject(new Error('No image'));
          }
        }, 500);
      };
      window.addEventListener('focus', onFocus);

      input.click();
    });
  }

  /**
   * Pick image from gallery / file system
   * Opens the photo gallery on mobile, file picker on desktop.
   * @returns {Promise<{blob: Blob, dataUrl: string, name: string, size: number, type: string}>}
   */
  pick() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      // No capture attribute — opens gallery/file picker
      input.style.display = 'none';

      document.body.appendChild(input);

      const cleanup = () => {
        try { document.body.removeChild(input); } catch {}
      };

      input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        cleanup();
        if (!file) {
          reject(new Error('No image'));
          return;
        }
        this._readFile(file).then(resolve).catch(reject);
      };

      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => {
          if (!input.files || input.files.length === 0) {
            cleanup();
            reject(new Error('No image'));
          }
        }, 500);
      };
      window.addEventListener('focus', onFocus);

      input.click();
    });
  }

  /**
   * Read a File into a data URL with metadata
   * @param {File} file
   * @returns {Promise<{blob: Blob, dataUrl: string, name: string, size: number, type: string}>}
   */
  _readFile(file) {
    return new Promise((resolve, reject) => {
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
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Resize image to reduce memory usage and produce compressed JPEG.
   * @param {string} dataUrl - Source image as data URL
   * @param {number} maxWidth - Maximum width/height (default 800)
   * @returns {Promise<string>} Resized JPEG data URL
   */
  resize(dataUrl, maxWidth = 800) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');

          // Calculate new dimensions maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxWidth) {
            const ratio = Math.min(maxWidth / width, maxWidth / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl); // fallback to original
            return;
          }

          // Draw with smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Export as JPEG with 80% quality
          const result = canvas.toDataURL('image/jpeg', 0.8);
          resolve(result);
        } catch (err) {
          // If canvas fails (e.g., tainted), return original
          console.warn('Image resize failed:', err);
          resolve(dataUrl);
        }
      };
      img.onerror = () => {
        reject(new Error('Failed to load image for resizing'));
      };
      img.src = dataUrl;
    });
  }
}
