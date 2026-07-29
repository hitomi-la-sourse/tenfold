import type { CSSProperties, ImgHTMLAttributes } from "react";

interface StaticImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string | { src: string };
  fill?: boolean;
  sizes?: string;
}

export default function StaticImage({ src, fill, sizes, style, ...props }: StaticImageProps) {
  const rawSource = typeof src === "string" ? src : src.src;
  const resolvedSource = rawSource.startsWith("/")
    ? `${import.meta.env.BASE_URL}${rawSource.slice(1)}`
    : rawSource;
  const fillStyle: CSSProperties | undefined = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style }
    : style;

  return <img {...props} src={resolvedSource} sizes={sizes} style={fillStyle} />;
}
