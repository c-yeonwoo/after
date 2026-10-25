/** Technical photo observations, never attractiveness or identity judgments. */
export type PhotoObservation = {
  width: number;
  height: number;
  meanBrightness: number;
  darkFraction: number;
  lightFraction: number;
};
export type PhotoTip = { kind: "resolution" | "dark" | "light" | "crop"; text: string };

export function photoTips(observation: PhotoObservation | null): PhotoTip[] {
  if (!observation) return [];
  const { width, height, meanBrightness, darkFraction, lightFraction } = observation;
  if (![width, height, meanBrightness, darkFraction, lightFraction].every(Number.isFinite))
    return [];
  if (width <= 0 || height <= 0) return [];
  const tips: PhotoTip[] = [];
  if (Math.min(width, height) < 480)
    tips.push({ kind: "resolution", text: "사진 크기가 작아요. 캡처본보다 원본을 골라볼까요?" });
  if (meanBrightness < 45 && darkFraction > 0.65)
    tips.push({
      kind: "dark",
      text: "전체적으로 어두운 사진이에요. 조금 더 밝은 사진도 살펴보세요.",
    });
  else if (meanBrightness > 235 && lightFraction > 0.65)
    tips.push({
      kind: "light",
      text: "밝은 부분이 많아요. 얼굴의 윤곽이 잘 보이는지 확인해 주세요.",
    });
  if (width / height > 1.8)
    tips.push({
      kind: "crop",
      text: "가로로 긴 사진이에요. 세로 화면에서 내 모습이 잘리지 않는지 확인해 주세요.",
    });
  return tips;
}

/** Runs only on files the member just selected; pixels stay in this browser. */
export async function inspectPhotoForCoaching(file: File): Promise<PhotoObservation | null> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // Transparent images are evaluated against the same white canvas, not black alpha.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 32, 32);
    ctx.drawImage(bitmap, 0, 0, 32, 32);
    const pixels = ctx.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    let dark = 0;
    let light = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const value = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      sum += value;
      if (value < 50) dark++;
      if (value > 235) light++;
    }
    const count = pixels.length / 4;
    return {
      width: bitmap.width,
      height: bitmap.height,
      meanBrightness: sum / count,
      darkFraction: dark / count,
      lightFraction: light / count,
    };
  } catch {
    // An unavailable browser decoder is not a moderation rejection.
    return null;
  } finally {
    bitmap?.close();
  }
}
