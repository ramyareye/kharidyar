import { ApiError } from "./api-errors";

export interface PrivateImageLimits {
  maxFileBytes: number;
  maxPixelCount: number;
  maxSidePixels: number;
}
const allowedInputTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const invalidMedia = (message: string) =>
  new ApiError(400, "INVALID_MEDIA", message);
const mediaLimit = (message: string) =>
  new ApiError(409, "MEDIA_LIMIT_EXCEEDED", message);

function bytesStream(bytes: ArrayBuffer): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream();
}

export async function normalizePrivateImage(input: {
  file: File;
  images: ImagesBinding;
  limits: PrivateImageLimits;
}): Promise<{
  bytes: ArrayBuffer;
  height: number;
  sha256: ArrayBuffer;
  sha256Hex: string;
  width: number;
}> {
  if (!allowedInputTypes.has(input.file.type)) {
    throw invalidMedia("Use a JPEG, PNG, or WebP image.");
  }
  if (input.file.size <= 0 || input.file.size > input.limits.maxFileBytes) {
    throw mediaLimit("The image exceeds the configured file-size limit.");
  }

  const source = await input.file.arrayBuffer();
  let sourceInfo: ImageInfoResponse;
  try {
    sourceInfo = await input.images.info(bytesStream(source));
  } catch {
    throw invalidMedia("The uploaded file could not be decoded as an image.");
  }
  if (!("width" in sourceInfo)) {
    throw invalidMedia("SVG images are not accepted.");
  }
  if (
    !allowedInputTypes.has(sourceInfo.format) ||
    sourceInfo.format !== input.file.type
  ) {
    throw invalidMedia(
      "The file contents do not match an accepted image type.",
    );
  }
  if (
    sourceInfo.width > input.limits.maxSidePixels ||
    sourceInfo.height > input.limits.maxSidePixels ||
    sourceInfo.width * sourceInfo.height > input.limits.maxPixelCount
  ) {
    throw mediaLimit("The image dimensions exceed the configured limit.");
  }

  let output: ArrayBuffer;
  try {
    const transformed = await input.images
      .input(bytesStream(source))
      .output({ anim: false, format: "image/webp", quality: 90 });
    output = await new Response(transformed.image()).arrayBuffer();
  } catch {
    throw invalidMedia("The image could not be safely normalized.");
  }
  if (output.byteLength <= 0 || output.byteLength > input.limits.maxFileBytes) {
    throw mediaLimit(
      "The normalized image exceeds the configured file-size limit.",
    );
  }

  let outputInfo: ImageInfoResponse;
  try {
    outputInfo = await input.images.info(bytesStream(output));
  } catch {
    throw invalidMedia("The normalized image could not be verified.");
  }
  if (!("width" in outputInfo)) {
    throw invalidMedia("The normalized image format is invalid.");
  }
  if (outputInfo.format !== "image/webp") {
    throw invalidMedia("The normalized image format is invalid.");
  }
  const sha256 = await crypto.subtle.digest("SHA-256", output);
  const sha256Hex = [...new Uint8Array(sha256)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    bytes: output,
    height: outputInfo.height,
    sha256,
    sha256Hex,
    width: outputInfo.width,
  };
}
