import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface QRCodeProps {
  /** The URL or text to encode. */
  value: string;
  /** Canvas size in CSS px (rendered at 2× for retina). Default 192. */
  size?: number;
  /** Accessible label for the canvas element. */
  label: string;
}

/**
 * Renders a QR code into a `<canvas>` using the `qrcode` library.
 * High error-correction level (H) so the code scans even if partially
 * obscured by a logo overlay (planned for future).
 */
export function QRCode({ value, size = 192, label }: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    void QRCodeLib.toCanvas(canvasRef.current, value, {
      width: size * 2, // render at 2× for retina; CSS constrains display size
      margin: 1,
      errorCorrectionLevel: "H",
      color: {
        dark: "#1a1a1a",
        light: "#ffffff",
      },
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={label}
      role="img"
      style={{ width: size, height: size }}
      className="rounded-lg"
    />
  );
}
