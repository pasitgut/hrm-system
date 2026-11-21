const DEFAULT_QUALITY_STEPS = [0.86, 0.78, 0.68, 0.56];

function loadImage(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("ไม่สามารถบีบอัดรูปภาพได้"));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function renameWithExtension(name, mimeType) {
  const base = (name || "image").replace(/\.[^.]+$/, "");
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `${base}.${ext}`;
}

export async function optimizeImageFile(
  file,
  {
    maxBytes = 3.5 * 1024 * 1024,
    maxDimension = 2400,
    outputType,
    quality = 0.86,
    alwaysResize = false,
  } = {},
) {
  if (!file || !file.type?.startsWith("image/")) {
    throw new Error("รองรับเฉพาะไฟล์รูปภาพ");
  }

  if (file.type === "image/gif" && file.size <= maxBytes) {
    return file;
  }

  if (!alwaysResize && file.size <= maxBytes) {
    return file;
  }

  const bitmap = await loadImage(file);
  const srcWidth = bitmap.width;
  const srcHeight = bitmap.height;
  const needsScale = Math.max(srcWidth, srcHeight) > maxDimension;

  if (!alwaysResize && !needsScale && file.size <= maxBytes) {
    if (typeof bitmap.close === "function") bitmap.close();
    return file;
  }

  const targetType = outputType
    ?? (file.type === "image/png" && file.size <= maxBytes * 1.5 ? "image/png" : "image/jpeg");

  const initialScale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
  let scale = initialScale;
  let lastBlob = null;

  try {
    for (let pass = 0; pass < 4; pass += 1) {
      const width = Math.max(1, Math.round(srcWidth * scale));
      const height = Math.max(1, Math.round(srcHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ");
      }
      if (targetType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(bitmap, 0, 0, width, height);

      const qualities = targetType === "image/png"
        ? [undefined]
        : [quality, ...DEFAULT_QUALITY_STEPS.filter((q) => q < quality)];

      for (const candidateQuality of qualities) {
        const blob = await canvasToBlob(canvas, targetType, candidateQuality);
        lastBlob = blob;
        if (blob.size <= maxBytes) {
          return new File([blob], renameWithExtension(file.name, blob.type || targetType), {
            type: blob.type || targetType,
          });
        }
      }

      scale *= 0.75;
    }
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }

  if (lastBlob && lastBlob.size <= maxBytes) {
    return new File([lastBlob], renameWithExtension(file.name, lastBlob.type || targetType), {
      type: lastBlob.type || targetType,
    });
  }

  throw new Error("ไฟล์รูปภาพมีขนาดใหญ่เกินไปแม้หลังบีบอัดแล้ว กรุณาเลือกรูปที่เล็กลง");
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("อ่านไฟล์รูปไม่สำเร็จ"));
      }
    };
    reader.onerror = () => reject(new Error("อ่านไฟล์รูปไม่สำเร็จ กรุณาเลือกรูปอื่น"));
    reader.readAsDataURL(file);
  });
}
